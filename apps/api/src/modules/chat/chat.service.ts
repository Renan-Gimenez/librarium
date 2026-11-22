import { createHash } from "node:crypto";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";

import { env } from "@/config/env";
import { ConflictError } from "@/errors";
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
export const CHAT_LOCK_TTL_SECONDS = 60;
export const RELEASE_LOCK_LUA_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

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

export interface ChatLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
  error?: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface ProcessChatMessageInput {
  token: string;
  message: string;
  logger?: ChatLogger;
}

export interface StreamChatMessageInput extends ProcessChatMessageInput {
  signal?: AbortSignal;
  onStreamStart?: () => void;
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
    set: {
      (
        key: string,
        value: string,
        expiryMode: "EX",
        seconds: number,
      ): Promise<unknown>;
      (
        key: string,
        value: string,
        expiryMode: "EX",
        seconds: number,
        condition: "NX",
      ): Promise<unknown>;
    };
    lrange?: (key: string, start: number, stop: number) => Promise<string[]>;
    eval?: (
      script: string,
      numkeys: number,
      ...args: (string | number)[]
    ) => Promise<unknown>;
    multi?: () => {
      del: (key: string) => unknown;
      rpush: (key: string, ...values: string[]) => unknown;
      ltrim: (key: string, start: number, stop: number) => unknown;
      expire: (key: string, seconds: number) => unknown;
      exec: () => Promise<unknown>;
    };
  };
  executeToolCall?: typeof executeChatToolCall;
  toolDeps?: ChatToolsDeps;
  logger?: ChatLogger;
  sessionTtl?: number;
  historyWindow?: number;
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

function isValidStoredMessage(m: unknown): m is StoredChatMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    ((m as StoredChatMessage).role === "user" ||
      (m as StoredChatMessage).role === "assistant") &&
    typeof (m as StoredChatMessage).content === "string"
  );
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

    return parsed.filter(isValidStoredMessage);
  } catch {
    return [];
  }
}

function parseStoredListHistory(items: string[]): StoredChatMessage[] {
  const result: StoredChatMessage[] = [];
  for (const raw of items) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isValidStoredMessage(parsed)) {
        result.push(parsed);
      }
    } catch {
      // Ignore malformed list entry
    }
  }
  return result;
}

function isWrongTypeError(err: unknown): boolean {
  return err instanceof Error && err.message.toUpperCase().includes("WRONGTYPE");
}

function stripLeadingAssistantMessages(
  history: StoredChatMessage[],
): StoredChatMessage[] {
  const firstUserIndex = history.findIndex((m) => m.role === "user");
  if (firstUserIndex === -1) {
    return [];
  }
  return firstUserIndex === 0 ? history : history.slice(firstUserIndex);
}

function isAbortLikeError(err: unknown, signal?: AbortSignal): boolean {
  return (
    Boolean(signal?.aborted) ||
    (err instanceof Error &&
      (err.name === "AbortError" || err.name === "APIUserAbortError"))
  );
}

async function releaseSessionLock(
  redisClient: NonNullable<ChatServiceBaseDeps["redis"]>,
  lockKey: string,
  lockOwner: string,
): Promise<void> {
  try {
    if (typeof redisClient.eval === "function") {
      await redisClient.eval(RELEASE_LOCK_LUA_SCRIPT, 1, lockKey, lockOwner);
    }
  } catch {
    // Best-effort lock release; TTL acts as fallback
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
  sessionHash: string;
  redisKey: string;
  lockKey: string;
  lockOwner: string;
  redisClient: NonNullable<ChatServiceBaseDeps["redis"]>;
  runToolCall: typeof executeChatToolCall;
  sessionTtl: number;
  historyWindow: number;
  migratedFromLegacyString: boolean;
  now: () => Date;
  generateId: () => string;
  messageHistory: StoredChatMessage[];
  messages: ChatCompletionMessageParam[];
}

async function loadChatHistory(
  redisClient: NonNullable<ChatServiceBaseDeps["redis"]>,
  redisKey: string,
  historyWindow: number,
): Promise<{
  messageHistory: StoredChatMessage[];
  migratedFromLegacyString: boolean;
}> {
  if (typeof redisClient.lrange === "function") {
    try {
      const items = await redisClient.lrange(redisKey, -historyWindow, -1);
      return {
        messageHistory: stripLeadingAssistantMessages(
          parseStoredListHistory(items),
        ),
        migratedFromLegacyString: false,
      };
    } catch (err) {
      if (!isWrongTypeError(err)) {
        throw err;
      }
      const legacyRaw = await redisClient.get(redisKey);
      return {
        messageHistory: stripLeadingAssistantMessages(
          parseStoredHistory(legacyRaw).slice(-historyWindow),
        ),
        migratedFromLegacyString: true,
      };
    }
  }

  const legacyRaw = await redisClient.get(redisKey);
  return {
    messageHistory: stripLeadingAssistantMessages(
      parseStoredHistory(legacyRaw).slice(-historyWindow),
    ),
    migratedFromLegacyString: legacyRaw !== null,
  };
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
  const historyWindow = deps?.historyWindow ?? env.CHAT_HISTORY_WINDOW;
  const now = deps?.now ?? (() => new Date());
  const generateId = deps?.generateId ?? (() => crypto.randomUUID());

  const sessionHash = hashSessionToken(normalizedToken);
  const redisKey = `chat:session:${normalizedToken}:messages`;
  const lockKey = `chat:session:${normalizedToken}:lock`;
  const lockOwner = crypto.randomUUID();

  throwIfAborted(signal);

  const lockAcquired = await redisClient.set(
    lockKey,
    lockOwner,
    "EX",
    CHAT_LOCK_TTL_SECONDS,
    "NX",
  );

  if (lockAcquired !== "OK") {
    throw new ConflictError(
      "A chat request is already in progress for this session.",
    );
  }

  try {
    throwIfAborted(signal);

    const [{ messageHistory, migratedFromLegacyString }, genres] =
      await raceWithSignal(
        Promise.all([
          loadChatHistory(redisClient, redisKey, historyWindow),
          db.genre.findMany({
            select: { slug: true, name: true },
            orderBy: { name: "asc" },
          }),
        ]),
        signal,
      );

    throwIfAborted(signal);

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
      sessionHash,
      redisKey,
      lockKey,
      lockOwner,
      redisClient,
      runToolCall,
      sessionTtl,
      historyWindow,
      migratedFromLegacyString,
      now,
      generateId,
      messageHistory,
      messages,
    };
  } catch (err) {
    await releaseSessionLock(redisClient, lockKey, lockOwner);
    throw err;
  }
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

  if (context.sessionTtl > 0) {
    if (typeof context.redisClient.multi === "function") {
      const entriesToPush = context.migratedFromLegacyString
        ? [...context.messageHistory, userMessage, assistantMessage].slice(
            -context.historyWindow,
          )
        : [userMessage, assistantMessage];
      const serializedEntries = entriesToPush.map((m) => JSON.stringify(m));

      const tx = context.redisClient.multi();
      if (context.migratedFromLegacyString) {
        tx.del(context.redisKey);
      }
      tx.rpush(context.redisKey, ...serializedEntries);
      tx.ltrim(context.redisKey, -context.historyWindow, -1);
      tx.expire(context.redisKey, context.sessionTtl);

      const execResult = await raceWithSignal(tx.exec(), signal);
      if (
        !Array.isArray(execResult) ||
        execResult.some(
          (entry) =>
            Array.isArray(entry) && entry[0] !== null && entry[0] !== undefined,
        )
      ) {
        const firstErr = Array.isArray(execResult)
          ? execResult.find((entry) => Array.isArray(entry) && entry[0])?.[0]
          : undefined;
        throw firstErr instanceof Error
          ? firstErr
          : new Error("Failed to persist chat history in Redis.");
      }
    } else {
      const updatedHistory: StoredChatMessage[] = [
        ...context.messageHistory,
        userMessage,
        assistantMessage,
      ].slice(-context.historyWindow);

      await raceWithSignal(
        context.redisClient.set(
          context.redisKey,
          JSON.stringify(updatedHistory),
          "EX",
          context.sessionTtl,
        ),
        signal,
      );
    }
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

function extractToolNames(toolCalls: ChatCompletionMessageToolCall[]): string[] {
  return toolCalls.map((tc) =>
    tc.type === "custom" ? tc.custom.name : tc.function.name,
  );
}

type ChatTurnOutcomeEvent =
  | "chat.turn.completed"
  | "chat.turn.aborted"
  | "chat.turn.rejected"
  | "chat.turn.failed";

function emitTurnLog(params: {
  logger?: ChatLogger;
  event: ChatTurnOutcomeEvent;
  mode: "sync" | "stream";
  sessionHash: string;
  toolsCalled: string[];
  toolRounds: number;
  totalUsage: ChatResponseUsage;
  startedAtMs: number;
  citedBooksCount: number;
}): void {
  const {
    logger,
    event,
    mode,
    sessionHash,
    toolsCalled,
    toolRounds,
    totalUsage,
    startedAtMs,
    citedBooksCount,
  } = params;

  if (!logger) {
    return;
  }

  const payload: Record<string, unknown> = {
    event,
    mode,
    sessionHash,
    toolsCalled,
    toolRounds,
    promptTokens: totalUsage.promptTokens,
    completionTokens: totalUsage.completionTokens,
    totalTokens: totalUsage.totalTokens,
    durationMs: Math.max(0, Math.round(performance.now() - startedAtMs)),
    citedBooksCount,
  };

  if (event === "chat.turn.failed" && logger.error) {
    logger.error(payload, event);
    return;
  }

  if (
    (event === "chat.turn.aborted" || event === "chat.turn.rejected") &&
    logger.warn
  ) {
    logger.warn(payload, event);
    return;
  }

  logger.info(payload, event);
}

export async function processChatMessage(
  input: ProcessChatMessageInput,
  deps?: ChatServiceDeps,
): Promise<ProcessChatMessageResult> {
  const startedAtMs = performance.now();
  const logger = input.logger ?? deps?.logger;
  const openaiClient: NonNullable<ChatServiceDeps["openai"]> =
    deps?.openai ?? openai;

  const totalUsage: ChatResponseUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  const candidateBooks = new Map<string, ToolBookCandidate>();
  const toolsCalled: string[] = [];
  let toolRounds = 0;
  let modelReply = "";
  let hasFinalReply = false;
  let context: PreparedChatContext | undefined;
  let outcomeEvent: ChatTurnOutcomeEvent = "chat.turn.completed";
  let citedBooksCount = 0;

  try {
    context = await prepareChatContext(input, deps);

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await openaiClient.chat.completions.create({
        ...COMPLETION_BASE_PARAMS,
        user: context.sessionHash,
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

      toolRounds += 1;
      toolsCalled.push(...extractToolNames(toolCalls));

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
        user: context.sessionHash,
        messages: context.messages,
      });

      accumulateUsage(totalUsage, finalResponse.usage);
      modelReply = finalResponse.choices[0]?.message.content ?? "";
    }

    const result = await finalizeChatResult({
      context,
      userInputMessage: input.message,
      rawModelReply: modelReply,
      candidateBooks,
      totalUsage,
    });
    citedBooksCount = result.data.books.length;
    return result;
  } catch (err) {
    if (isAbortLikeError(err)) {
      outcomeEvent = "chat.turn.aborted";
    } else if (err instanceof ConflictError) {
      outcomeEvent = "chat.turn.rejected";
    } else {
      outcomeEvent = "chat.turn.failed";
    }
    throw err;
  } finally {
    if (context) {
      await releaseSessionLock(
        context.redisClient,
        context.lockKey,
        context.lockOwner,
      );
    }
    try {
      const normalizedToken = input.token.trim();
      emitTurnLog({
        logger,
        event: outcomeEvent,
        mode: "sync",
        sessionHash:
          context?.sessionHash ??
          (normalizedToken ? hashSessionToken(normalizedToken) : "invalid"),
        toolsCalled,
        toolRounds,
        totalUsage,
        startedAtMs,
        citedBooksCount,
      });
    } catch {
      // Never allow logger errors to mask the turn outcome
    }
  }
}

/**
 * Processes a chat message while streaming tokens in real time across tool-calling rounds.
 * Persists user/assistant turns to Redis only upon uncancelled completion.
 */
export async function streamChatMessage(
  input: StreamChatMessageInput,
  deps?: ChatStreamServiceDeps,
): Promise<ProcessChatMessageResult> {
  const startedAtMs = performance.now();
  const logger = input.logger ?? deps?.logger;
  const { signal, onDelta, onStreamStart } = input;
  const openaiClient: NonNullable<ChatStreamServiceDeps["openai"]> =
    deps?.openai ?? openai;

  const totalUsage: ChatResponseUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  const candidateBooks = new Map<string, ToolBookCandidate>();
  const toolsCalled: string[] = [];
  let toolRounds = 0;
  let modelReply = "";
  let streamedPrefix = "";
  let hasFinalReply = false;
  let hasEmittedVisibleContent = false;
  let pendingLeadingWhitespace = "";
  let needsSeparatorBeforeNextVisible = false;
  const requestOptions = signal ? { signal } : undefined;
  let context: PreparedChatContext | undefined;
  let outcomeEvent: ChatTurnOutcomeEvent = "chat.turn.completed";
  let citedBooksCount = 0;

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

  try {
    context = await prepareChatContext(input, deps, signal);
    onStreamStart?.();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      throwIfAborted(signal);

      const stream = await raceWithSignal(
        openaiClient.chat.completions.create(
          {
            ...COMPLETION_BASE_PARAMS,
            user: context.sessionHash,
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

      toolRounds += 1;
      toolsCalled.push(...extractToolNames(outcome.toolCalls));

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
            user: context.sessionHash,
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

    const result = await finalizeChatResult({
      context,
      userInputMessage: input.message,
      rawModelReply: `${streamedPrefix}${modelReply}`,
      candidateBooks,
      totalUsage,
      signal,
      onFallback: (fallbackReply) => onDelta?.(fallbackReply),
    });
    citedBooksCount = result.data.books.length;
    return result;
  } catch (err) {
    if (isAbortLikeError(err, signal)) {
      outcomeEvent = "chat.turn.aborted";
    } else if (err instanceof ConflictError) {
      outcomeEvent = "chat.turn.rejected";
    } else {
      outcomeEvent = "chat.turn.failed";
    }
    throw err;
  } finally {
    if (context) {
      await releaseSessionLock(
        context.redisClient,
        context.lockKey,
        context.lockOwner,
      );
    }
    try {
      const normalizedToken = input.token.trim();
      emitTurnLog({
        logger,
        event: outcomeEvent,
        mode: "stream",
        sessionHash:
          context?.sessionHash ??
          (normalizedToken ? hashSessionToken(normalizedToken) : "invalid"),
        toolsCalled,
        toolRounds,
        totalUsage,
        startedAtMs,
        citedBooksCount,
      });
    } catch {
      // Never allow logger errors to mask the turn outcome
    }
  }
}
