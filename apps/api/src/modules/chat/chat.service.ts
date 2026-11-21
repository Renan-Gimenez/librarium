import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
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

export interface StreamChatMessageInput extends ProcessChatMessageInput {
  signal?: AbortSignal;
  onDelta?: (content: string) => void;
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

export interface ChatServiceBaseDeps {
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
  executeToolCall?: typeof executeChatToolCall;
  toolDeps?: ChatToolsDeps;
  sessionTtl?: number;
  now?: () => Date;
  generateId?: () => string;
}

export interface ChatServiceDeps extends ChatServiceBaseDeps {
  openai?: {
    chat: {
      completions: {
        create: (
          body: ChatCompletionCreateParamsNonStreaming,
        ) => Promise<ChatCompletion>;
      };
    };
  };
}

export interface ChatStreamServiceDeps extends ChatServiceBaseDeps {
  openai?: {
    chat: {
      completions: {
        create: (
          body: ChatCompletionCreateParamsStreaming,
          options?: { signal?: AbortSignal },
        ) => Promise<AsyncIterable<ChatCompletionChunk>>;
      };
    };
  };
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

function createAbortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
}

async function raceWithSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) {
    return promise;
  }
  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

interface PreparedChatContext {
  normalizedToken: string;
  redisKey: string;
  redisClient: NonNullable<ChatServiceBaseDeps["redis"]>;
  runToolCall: typeof executeChatToolCall;
  sessionTtl: number;
  now: () => Date;
  generateId: () => string;
  messageHistory: StoredChatMessage[];
  messages: ChatCompletionMessageParam[];
}

async function prepareChatContext(
  input: ProcessChatMessageInput,
  deps?: ChatServiceBaseDeps,
  signal?: AbortSignal,
): Promise<PreparedChatContext> {
  const { token, message } = input;
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error("Session token is required");
  }

  throwIfAborted(signal);

  const db: NonNullable<ChatServiceBaseDeps["prisma"]> = deps?.prisma ?? prisma;
  const redisClient: NonNullable<ChatServiceBaseDeps["redis"]> =
    deps?.redis ?? redis;
  const runToolCall = deps?.executeToolCall ?? executeChatToolCall;
  const sessionTtl = deps?.sessionTtl ?? env.CHAT_SESSION_TTL;
  const now = deps?.now ?? (() => new Date());
  const generateId = deps?.generateId ?? (() => crypto.randomUUID());

  const redisKey = `chat:session:${normalizedToken}:messages`;

  const [cachedHistory, genres] = await raceWithSignal(
    Promise.all([
      redisClient.get(redisKey),
      db.genre.findMany({
        select: { slug: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]),
    signal,
  );

  throwIfAborted(signal);

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

  return {
    normalizedToken,
    redisKey,
    redisClient,
    runToolCall,
    sessionTtl,
    now,
    generateId,
    messageHistory,
    messages,
  };
}

async function executeAndAppendToolRound(params: {
  toolCalls: ChatCompletionMessageToolCall[];
  assistantContent: string | null;
  messages: ChatCompletionMessageParam[];
  candidateBooks: Map<string, ToolBookCandidate>;
  runToolCall: typeof executeChatToolCall;
  toolDeps?: ChatToolsDeps;
  signal?: AbortSignal;
}): Promise<void> {
  const {
    toolCalls,
    assistantContent,
    messages,
    candidateBooks,
    runToolCall,
    toolDeps,
    signal,
  } = params;

  throwIfAborted(signal);

  messages.push({
    role: "assistant",
    content: assistantContent,
    tool_calls: toolCalls,
  });

  const toolResults = await raceWithSignal(
    Promise.all(toolCalls.map((toolCall) => runToolCall(toolCall, toolDeps))),
    signal,
  );

  throwIfAborted(signal);

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

async function finalizeChatResult(params: {
  context: PreparedChatContext;
  userInputMessage: string;
  rawModelReply: string;
  candidateBooks: Map<string, ToolBookCandidate>;
  totalUsage: ChatResponseUsage;
  signal?: AbortSignal;
  onFallback?: (fallbackReply: string) => void;
}): Promise<ProcessChatMessageResult> {
  const {
    context,
    userInputMessage,
    rawModelReply,
    candidateBooks,
    totalUsage,
    signal,
    onFallback,
  } = params;

  throwIfAborted(signal);

  let modelReply = rawModelReply;
  const usedFallback = !modelReply.trim();
  if (usedFallback) {
    modelReply = FALLBACK_EMPTY_REPLY;
  }

  throwIfAborted(signal);

  const userMessage: StoredChatMessage = {
    id: context.generateId(),
    role: "user",
    content: userInputMessage,
    createdAt: context.now().toISOString(),
  };

  const assistantMessage: StoredChatMessage = {
    id: context.generateId(),
    role: "assistant",
    content: modelReply,
    createdAt: context.now().toISOString(),
  };

  const updatedHistory: StoredChatMessage[] = [
    ...context.messageHistory,
    userMessage,
    assistantMessage,
  ];

  if (context.sessionTtl > 0) {
    await raceWithSignal(
      context.redisClient.set(
        context.redisKey,
        JSON.stringify(updatedHistory),
        "EX",
        context.sessionTtl,
      ),
      signal,
    );
    throwIfAborted(signal);
  }

  if (usedFallback) {
    onFallback?.(modelReply);
  }

  const citedBooks = usedFallback
    ? []
    : Array.from(candidateBooks.values())
        .filter((book) => isBookCitedInReply(book.title, modelReply))
        .map(toCitedBook);

  return {
    data: {
      userMessage: userInputMessage,
      modelReply,
      books: citedBooks,
    },
    meta: {
      usage: totalUsage,
    },
  };
}

interface AccumulatedToolCall {
  id: string;
  type: "function" | "custom";
  functionName: string;
  functionArguments: string;
  customName: string;
  customInput: string;
}

interface StreamRoundOutcome {
  content: string;
  toolCalls: ChatCompletionMessageToolCall[];
}

async function consumeCompletionStream(
  stream: AsyncIterable<ChatCompletionChunk>,
  totalUsage: ChatResponseUsage,
  signal?: AbortSignal,
  onDelta?: (content: string) => void,
): Promise<StreamRoundOutcome> {
  let content = "";
  const toolCallsByIndex = new Map<number, AccumulatedToolCall>();
  const iterator = stream[Symbol.asyncIterator]();
  let completed = false;

  try {
    while (true) {
      const step = await raceWithSignal(iterator.next(), signal);
      if (step.done) {
        completed = true;
        break;
      }

      const chunk = step.value;
      throwIfAborted(signal);

      if (chunk.usage) {
        accumulateUsage(totalUsage, chunk.usage);
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) {
        continue;
      }

      if (typeof delta.content === "string" && delta.content.length > 0) {
        content += delta.content;
        onDelta?.(delta.content);
      }

      if (delta.tool_calls && delta.tool_calls.length > 0) {
        for (const tc of delta.tool_calls) {
          const idx = typeof tc.index === "number" ? tc.index : 0;
          const existing = toolCallsByIndex.get(idx) ?? {
            id: "",
            type: "function" as const,
            functionName: "",
            functionArguments: "",
            customName: "",
            customInput: "",
          };

          if (tc.id) {
            existing.id = tc.id;
          }
          if (tc.type) {
            existing.type = tc.type;
          }
          if (tc.function?.name) {
            existing.functionName += tc.function.name;
          }
          if (tc.function?.arguments) {
            existing.functionArguments += tc.function.arguments;
          }
          if (tc.custom?.name) {
            existing.customName += tc.custom.name;
          }
          if (tc.custom?.input) {
            existing.customInput += tc.custom.input;
          }

          toolCallsByIndex.set(idx, existing);
        }
      }
    }
  } finally {
    if (!completed) {
      await iterator.return?.().catch(() => {});
    }
  }

  throwIfAborted(signal);

  const toolCalls: ChatCompletionMessageToolCall[] = Array.from(
    toolCallsByIndex.entries(),
  )
    .sort(([indexA], [indexB]) => indexA - indexB)
    .map(([, acc]) => {
      if (!acc.id) {
        throw new Error("Streamed tool call missing id");
      }

      return acc.type === "custom"
        ? {
            id: acc.id,
            type: "custom",
            custom: {
              name: acc.customName,
              input: acc.customInput,
            },
          }
        : {
            id: acc.id,
            type: "function",
            function: {
              name: acc.functionName,
              arguments: acc.functionArguments,
            },
          };
    });

  return { content, toolCalls };
}

export async function processChatMessage(
  input: ProcessChatMessageInput,
  deps?: ChatServiceDeps,
): Promise<ProcessChatMessageResult> {
  const context = await prepareChatContext(input, deps);
  const openaiClient: NonNullable<ChatServiceDeps["openai"]> =
    deps?.openai ?? openai;

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
      user: context.normalizedToken,
      messages: context.messages,
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

    await executeAndAppendToolRound({
      toolCalls,
      assistantContent: assistantMessage.content ?? null,
      messages: context.messages,
      candidateBooks,
      runToolCall: context.runToolCall,
      toolDeps: deps?.toolDeps,
    });
  }

  if (!hasFinalReply) {
    const finalResponse = await openaiClient.chat.completions.create({
      ...COMPLETION_BASE_PARAMS,
      user: context.normalizedToken,
      messages: context.messages,
    });

    accumulateUsage(totalUsage, finalResponse.usage);
    modelReply = finalResponse.choices[0]?.message.content ?? "";
  }

  return finalizeChatResult({
    context,
    userInputMessage: input.message,
    rawModelReply: modelReply,
    candidateBooks,
    totalUsage,
  });
}

/**
 * Processes a chat message while streaming tokens in real time across tool-calling rounds.
 * Persists user/assistant turns to Redis only upon uncancelled completion.
 */
export async function streamChatMessage(
  input: StreamChatMessageInput,
  deps?: ChatStreamServiceDeps,
): Promise<ProcessChatMessageResult> {
  const { signal, onDelta } = input;
  const context = await prepareChatContext(input, deps, signal);
  const openaiClient: NonNullable<ChatStreamServiceDeps["openai"]> =
    deps?.openai ?? openai;

  const totalUsage: ChatResponseUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  const candidateBooks = new Map<string, ToolBookCandidate>();
  let modelReply = "";
  let streamedPrefix = "";
  let hasFinalReply = false;
  let hasEmittedVisibleContent = false;
  let pendingLeadingWhitespace = "";
  let needsSeparatorBeforeNextVisible = false;
  const requestOptions = signal ? { signal } : undefined;

  const forwardDelta = (delta: string) => {
    if (!hasEmittedVisibleContent) {
      if (!delta.trim()) {
        pendingLeadingWhitespace += delta;
        return;
      }

      hasEmittedVisibleContent = true;
      onDelta?.(`${pendingLeadingWhitespace}${delta}`);
      pendingLeadingWhitespace = "";
      return;
    }

    if (needsSeparatorBeforeNextVisible) {
      if (/^\s/.test(delta)) {
        needsSeparatorBeforeNextVisible = false;
      } else if (delta.trim().length > 0) {
        onDelta?.("\n\n");
        streamedPrefix += "\n\n";
        needsSeparatorBeforeNextVisible = false;
      }
    }

    onDelta?.(delta);
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    throwIfAborted(signal);

    const stream = await raceWithSignal(
      openaiClient.chat.completions.create(
        {
          ...COMPLETION_BASE_PARAMS,
          user: context.normalizedToken,
          messages: context.messages,
          tools: CHAT_TOOLS,
          tool_choice: "auto",
          stream: true,
          stream_options: { include_usage: true },
        },
        requestOptions,
      ),
      signal,
    );

    const outcome = await consumeCompletionStream(
      stream,
      totalUsage,
      signal,
      forwardDelta,
    );

    if (outcome.toolCalls.length === 0) {
      modelReply = outcome.content;
      hasFinalReply = true;
      break;
    }

    if (outcome.content.length > 0) {
      streamedPrefix += outcome.content;
      if (hasEmittedVisibleContent && !/\s$/.test(streamedPrefix)) {
        needsSeparatorBeforeNextVisible = true;
      }
    }

    await executeAndAppendToolRound({
      toolCalls: outcome.toolCalls,
      assistantContent: outcome.content || null,
      messages: context.messages,
      candidateBooks,
      runToolCall: context.runToolCall,
      toolDeps: deps?.toolDeps,
      signal,
    });
  }

  if (!hasFinalReply) {
    throwIfAborted(signal);

    const finalStream = await raceWithSignal(
      openaiClient.chat.completions.create(
        {
          ...COMPLETION_BASE_PARAMS,
          user: context.normalizedToken,
          messages: context.messages,
          stream: true,
          stream_options: { include_usage: true },
        },
        requestOptions,
      ),
      signal,
    );

    const finalOutcome = await consumeCompletionStream(
      finalStream,
      totalUsage,
      signal,
      forwardDelta,
    );

    modelReply = finalOutcome.content;
  }

  return finalizeChatResult({
    context,
    userInputMessage: input.message,
    rawModelReply: `${streamedPrefix}${modelReply}`,
    candidateBooks,
    totalUsage,
    signal,
    onFallback: (fallbackReply) => onDelta?.(fallbackReply),
  });
}
