import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

import { env } from "@/config/env";
import { openai, prisma, redis } from "@/lib";

import { buildSystemPrompt, type PromptGenre } from "./chat.prompts";
import {
  CHAT_TOOLS,
  executeChatToolCall,
  normalizeRating,
  toIsoOrNull,
  type ChatToolsDeps,
  type ToolBookCandidate,
} from "./chat.tools";

export const MAX_TOOL_ROUNDS = 4;

export const FALLBACK_EMPTY_REPLY =
  "Desculpe, não consegui concluir a busca no acervo neste momento. Tente reformular sua pergunta sobre livros, autores ou gêneros.";

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ChatResponseBook {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  rating: number | null;
  publishedAt: string | null;
  genres: { slug: string; name: string }[];
  similarity?: number;
}

export interface ChatResponseUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ProcessChatMessageInput {
  token: string;
  message: string;
}

export interface ProcessChatMessageResult {
  data: {
    userMessage: string;
    modelReply: string;
    books: ChatResponseBook[];
  };
  meta: {
    usage: ChatResponseUsage;
  };
}

export interface ChatServiceDeps {
  prisma?: {
    genre: {
      findMany: (args?: {
        select?: { slug: true; name: true };
        orderBy?: { name: "asc" | "desc" };
      }) => Promise<PromptGenre[]>;
    };
  };
  redis?: {
    get: (key: string) => Promise<string | null>;
    set: (
      key: string,
      value: string,
      expiryMode: "EX",
      seconds: number,
    ) => Promise<unknown>;
  };
  openai?: {
    chat: {
      completions: {
        create: (
          body: ChatCompletionCreateParamsNonStreaming,
        ) => Promise<ChatCompletion>;
      };
    };
  };
  executeToolCall?: typeof executeChatToolCall;
  toolDeps?: ChatToolsDeps;
  sessionTtl?: number;
  now?: () => Date;
  generateId?: () => string;
}

const COMPLETION_BASE_PARAMS = {
  model: "gpt-4o-mini",
  temperature: 0.7,
  max_completion_tokens: 600,
  presence_penalty: 0.2,
  frequency_penalty: 0.3,
} as const;

export function normalizeForCitation(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isBookCitedInReply(title: string, reply: string): boolean {
  const normalizedTitle = normalizeForCitation(title)
    .trim()
    .replace(/\s+/g, " ");
  if (!normalizedTitle) {
    return false;
  }

  const normalizedReply = normalizeForCitation(reply);
  const titlePattern = escapeRegExp(normalizedTitle).replace(/ /g, "\\s+");
  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${titlePattern}(?:$|[^\\p{L}\\p{N}])`,
    "u",
  );

  return pattern.test(normalizedReply);
}

function parseStoredHistory(rawHistory: string | null): StoredChatMessage[] {
  if (!rawHistory) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(rawHistory);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (m): m is StoredChatMessage =>
        typeof m === "object" &&
        m !== null &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    );
  } catch {
    return [];
  }
}

function mergeCandidateBook(
  candidates: Map<string, ToolBookCandidate>,
  incoming: ToolBookCandidate,
): void {
  const existing = candidates.get(incoming.id);
  const existingSim =
    typeof existing?.similarity === "number" &&
    Number.isFinite(existing.similarity)
      ? existing.similarity
      : undefined;
  const incomingSim =
    typeof incoming.similarity === "number" &&
    Number.isFinite(incoming.similarity)
      ? incoming.similarity
      : undefined;
  const bestSimilarity =
    existingSim !== undefined && incomingSim !== undefined
      ? Math.max(existingSim, incomingSim)
      : (existingSim ?? incomingSim);

  candidates.set(incoming.id, {
    id: incoming.id,
    title: incoming.title,
    author: incoming.author,
    description: incoming.description,
    coverUrl: incoming.coverUrl,
    rating: incoming.rating,
    publishedAt: incoming.publishedAt,
    genres: incoming.genres ?? [],
    ...(bestSimilarity !== undefined && { similarity: bestSimilarity }),
  });
}

function toCitedBook(book: ToolBookCandidate): ChatResponseBook {
  const hasValidSimilarity =
    typeof book.similarity === "number" && Number.isFinite(book.similarity);

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    description: book.description,
    coverUrl: book.coverUrl,
    rating: normalizeRating(book.rating),
    publishedAt: toIsoOrNull(book.publishedAt),
    genres: book.genres ?? [],
    ...(hasValidSimilarity && {
      similarity: Math.max(
        1,
        Math.min(100, Math.round((book.similarity as number) * 100)),
      ),
    }),
  };
}

function accumulateUsage(
  total: ChatResponseUsage,
  usage?: ChatCompletion["usage"] | null,
): void {
  if (!usage) {
    return;
  }

  total.promptTokens += usage.prompt_tokens ?? 0;
  total.completionTokens += usage.completion_tokens ?? 0;
  total.totalTokens += usage.total_tokens ?? 0;
}

export async function processChatMessage(
  input: ProcessChatMessageInput,
  deps?: ChatServiceDeps,
): Promise<ProcessChatMessageResult> {
  const { token, message } = input;
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error("Session token is required");
  }

  const db: NonNullable<ChatServiceDeps["prisma"]> = deps?.prisma ?? prisma;
  const redisClient: NonNullable<ChatServiceDeps["redis"]> =
    deps?.redis ?? redis;
  const openaiClient: NonNullable<ChatServiceDeps["openai"]> =
    deps?.openai ?? openai;
  const runToolCall = deps?.executeToolCall ?? executeChatToolCall;
  const sessionTtl = deps?.sessionTtl ?? env.CHAT_SESSION_TTL;
  const now = deps?.now ?? (() => new Date());
  const generateId = deps?.generateId ?? (() => crypto.randomUUID());

  const redisKey = `chat:session:${normalizedToken}:messages`;

  const [cachedHistory, genres] = await Promise.all([
    redisClient.get(redisKey),
    db.genre.findMany({
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const messageHistory = parseStoredHistory(cachedHistory);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildSystemPrompt(genres),
    },
    ...messageHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: "user",
      content: message,
    },
  ];

  const totalUsage: ChatResponseUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  const candidateBooks = new Map<string, ToolBookCandidate>();
  let modelReply = "";
  let hasFinalReply = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await openaiClient.chat.completions.create({
      ...COMPLETION_BASE_PARAMS,
      user: normalizedToken,
      messages,
      tools: CHAT_TOOLS,
      tool_choice: "auto",
    });

    accumulateUsage(totalUsage, response.usage);

    const assistantMessage = response.choices[0]?.message;
    const toolCalls = assistantMessage?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      modelReply = assistantMessage?.content ?? "";
      hasFinalReply = true;
      break;
    }

    messages.push({
      role: "assistant",
      content: assistantMessage.content ?? null,
      tool_calls: toolCalls,
    });

    const toolResults = await Promise.all(
      toolCalls.map((toolCall) => runToolCall(toolCall, deps?.toolDeps)),
    );

    for (const result of toolResults) {
      for (const book of result.books) {
        mergeCandidateBook(candidateBooks, book);
      }

      messages.push({
        role: "tool",
        tool_call_id: result.toolCallId,
        content: result.content,
      });
    }
  }

  if (!hasFinalReply) {
    const finalResponse = await openaiClient.chat.completions.create({
      ...COMPLETION_BASE_PARAMS,
      user: normalizedToken,
      messages,
    });

    accumulateUsage(totalUsage, finalResponse.usage);
    modelReply = finalResponse.choices[0]?.message.content ?? "";
  }

  const usedFallback = !modelReply.trim();
  if (usedFallback) {
    modelReply = FALLBACK_EMPTY_REPLY;
  }

  const userMessage: StoredChatMessage = {
    id: generateId(),
    role: "user",
    content: message,
    createdAt: now().toISOString(),
  };

  const assistantMessage: StoredChatMessage = {
    id: generateId(),
    role: "assistant",
    content: modelReply,
    createdAt: now().toISOString(),
  };

  const updatedHistory: StoredChatMessage[] = [
    ...messageHistory,
    userMessage,
    assistantMessage,
  ];

  if (sessionTtl > 0) {
    await redisClient.set(
      redisKey,
      JSON.stringify(updatedHistory),
      "EX",
      sessionTtl,
    );
  }

  const citedBooks = usedFallback
    ? []
    : Array.from(candidateBooks.values())
        .filter((book) => isBookCitedInReply(book.title, modelReply))
        .map(toCitedBook);

  return {
    data: {
      userMessage: message,
      modelReply,
      books: citedBooks,
    },
    meta: {
      usage: totalUsage,
    },
  };
}
