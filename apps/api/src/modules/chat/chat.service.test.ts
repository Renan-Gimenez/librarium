import { describe, expect, it, mock } from "bun:test";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";

import type { BookWithGenres, SimilarBook } from "../book/book.service";
import { buildSystemPrompt } from "./chat.prompts";
import {
  FALLBACK_EMPTY_REPLY,
  isBookCitedInReply,
  MAX_TOOL_ROUNDS,
  processChatMessage,
  type ChatServiceDeps,
  type StoredChatMessage,
} from "./chat.service";

const makeCompletion = (params: {
  content?: string | null;
  toolCalls?: ChatCompletionMessageToolCall[];
  usage?: { prompt: number; completion: number; total: number };
}): ChatCompletion => ({
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 1700000000,
  model: "gpt-4o-mini",
  choices: [
    {
      index: 0,
      finish_reason: params.toolCalls?.length ? "tool_calls" : "stop",
      logprobs: null,
      message: {
        role: "assistant",
        content: params.content ?? null,
        refusal: null,
        ...(params.toolCalls?.length ? { tool_calls: params.toolCalls } : {}),
      },
    },
  ],
  usage: params.usage
    ? {
        prompt_tokens: params.usage.prompt,
        completion_tokens: params.usage.completion,
        total_tokens: params.usage.total,
      }
    : undefined,
});

const makeToolCall = (
  id: string,
  name: string,
  args: string,
): ChatCompletionMessageToolCall => ({
  id,
  type: "function",
  function: { name, arguments: args },
});

const makeSimilarBook = (overrides: Partial<SimilarBook> = {}): SimilarBook => ({
  id: "book-sem-1",
  title: "Solaris",
  author: "Stanislaw Lem",
  description: "Exploração sobre solidão no espaço.",
  coverUrl: "https://example.com/solaris.jpg",
  rating: 4.8,
  publishedAt: new Date("1961-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  genres: [{ slug: "ficcao-cientifica", name: "Ficção Científica" }],
  similarity: 0.86,
  ...overrides,
});

const makeStructuredBook = (
  overrides: Partial<BookWithGenres> = {},
): BookWithGenres => ({
  id: "book-str-1",
  title: "Fundação",
  author: "Isaac Asimov",
  description: "Império galáctico e psico-história.",
  coverUrl: "https://example.com/fundacao.jpg",
  rating: 4.9,
  publishedAt: new Date("1951-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  genres: [
    {
      slug: "ficcao",
      name: "Ficção",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  ...overrides,
});

function createBaseDeps(
  responses: ChatCompletion[],
  overrides: Partial<ChatServiceDeps> = {},
) {
  let callIndex = 0;
  const recordedCalls: ChatCompletionCreateParamsNonStreaming[] = [];

  const createMock = mock(
    async (body: ChatCompletionCreateParamsNonStreaming) => {
      recordedCalls.push(JSON.parse(JSON.stringify(body)));
      const response = responses[callIndex];
      callIndex += 1;
      if (!response) {
        throw new Error(`Unexpected OpenAI call #${callIndex}`);
      }
      return response;
    },
  );

  let storedValue: string | null = null;
  let storedKey: string | null = null;
  let storedTtl: number | null = null;

  const redisMock = {
    get: mock(async (_key: string) => storedValue),
    set: mock(
      async (
        key: string,
        value: string,
        _expiryMode: "EX",
        seconds: number,
      ) => {
        storedKey = key;
        storedValue = value;
        storedTtl = seconds;
        return "OK" as const;
      },
    ),
  };

  const defaultGenres = [
    { slug: "ficcao", name: "Ficção" },
    { slug: "ficcao-cientifica", name: "Ficção Científica" },
  ];

  const prismaMock = {
    genre: {
      findMany: mock(async () => defaultGenres),
    },
  };

  let idSeq = 0;

  const deps: ChatServiceDeps = {
    prisma: prismaMock,
    redis: redisMock,
    openai: {
      chat: {
        completions: {
          create: createMock,
        },
      },
    },
    sessionTtl: 3600,
    now: () => new Date("2026-11-20T22:00:00.000Z"),
    generateId: () => `msg-${++idSeq}`,
    ...overrides,
  };

  return {
    deps,
    recordedCalls,
    createMock,
    redisMock,
    prismaMock,
    getStored: () => ({
      key: storedKey,
      ttl: storedTtl,
      messages: storedValue
        ? (JSON.parse(storedValue) as StoredChatMessage[])
        : [],
    }),
    setInitialRawRedisValue: (raw: string) => {
      storedValue = raw;
    },
    setInitialRedisHistory: (history: StoredChatMessage[]) => {
      storedValue = JSON.stringify(history);
    },
  };
}

describe("chat.prompts", () => {
  it("injects genres formatted as Nome (slug) and tool usage guidelines", () => {
    const prompt = buildSystemPrompt([
      { slug: "ficcao", name: "Ficção" },
      { slug: "terror", name: "Terror" },
    ]);

    expect(prompt).toContain("Ficção (ficcao)");
    expect(prompt).toContain("Terror (terror)");
    expect(prompt).toContain("searchSemanticBooks");
    expect(prompt).toContain("searchBooks");
    expect(prompt).toContain("Não chame nenhuma ferramenta");
  });

  it("handles empty genre list gracefully", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("Nenhum gênero cadastrado no momento.");
  });
});

describe("chat.service", () => {
  it("rejects empty or whitespace-only session tokens", async () => {
    const { deps } = createBaseDeps([]);

    await expect(
      processChatMessage({ token: "", message: "Olá" }, deps),
    ).rejects.toThrow("Session token is required");

    await expect(
      processChatMessage({ token: "   ", message: "Olá" }, deps),
    ).rejects.toThrow("Session token is required");
  });

  it("handles greeting without tool calls, returns books: [], injects genres, and saves clean Redis history atomically", async () => {
    const { deps, recordedCalls, redisMock, getStored } = createBaseDeps(
      [
        makeCompletion({
          content: "Olá! Tudo ótimo por aqui. Que tipo de livro você procura?",
          usage: { prompt: 120, completion: 18, total: 138 },
        }),
      ],
      {
        toolDeps: {
          searchSimilarBooks: mock(async () => {
            throw new Error("Should not call semantic search on greeting");
          }),
          listBooks: mock(async () => {
            throw new Error("Should not call structured search on greeting");
          }),
        },
      },
    );

    const result = await processChatMessage(
      { token: " session-123 ", message: "Olá, tudo bem?" },
      deps,
    );

    expect(recordedCalls).toHaveLength(1);
    expect(recordedCalls[0]?.tools).toHaveLength(2);
    expect(recordedCalls[0]?.tool_choice).toBe("auto");
    expect(recordedCalls[0]?.user).toBe("session-123");

    const systemMsg = recordedCalls[0]?.messages[0];
    expect(systemMsg?.role).toBe("system");
    expect(String(systemMsg?.content)).toContain("Ficção (ficcao)");

    expect(result).toEqual({
      data: {
        userMessage: "Olá, tudo bem?",
        modelReply:
          "Olá! Tudo ótimo por aqui. Que tipo de livro você procura?",
        books: [],
      },
      meta: {
        usage: {
          promptTokens: 120,
          completionTokens: 18,
          totalTokens: 138,
        },
      },
    });

    expect(redisMock.set).toHaveBeenCalledTimes(1);
    const setArgs = redisMock.set.mock.calls[0] as unknown[];
    expect(setArgs[0]).toBe("chat:session:session-123:messages");
    expect(setArgs[2]).toBe("EX");
    expect(setArgs[3]).toBe(3600);

    const stored = getStored();
    expect(stored.key).toBe("chat:session:session-123:messages");
    expect(stored.ttl).toBe(3600);
    expect(stored.messages).toEqual([
      {
        id: "msg-1",
        role: "user",
        content: "Olá, tudo bem?",
        createdAt: "2026-11-20T22:00:00.000Z",
      },
      {
        id: "msg-2",
        role: "assistant",
        content: "Olá! Tudo ótimo por aqui. Que tipo de livro você procura?",
        createdAt: "2026-11-20T22:00:00.000Z",
      },
    ]);
  });

  it("skips Redis persistence when sessionTtl <= 0", async () => {
    const { deps, redisMock } = createBaseDeps(
      [makeCompletion({ content: "Oi!", usage: { prompt: 10, completion: 5, total: 15 } })],
      { sessionTtl: 0 },
    );

    await processChatMessage({ token: "tok", message: "Oi" }, deps);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("executes conceptual semantic search, verifies message sequence, asserts complete DTO, and excludes uncited high-similarity candidates", async () => {
    const solaris = makeSimilarBook({
      id: "solaris-id",
      title: "Solaris",
      similarity: 0.834,
    });
    const uncitedHighSim = makeSimilarBook({
      id: "uncited-id",
      title: "O Fim da Eternidade",
      similarity: 0.85,
    });

    const searchSimilarMock = mock(async () => [solaris, uncitedHighSim]);

    const { deps, recordedCalls, getStored } = createBaseDeps(
      [
        makeCompletion({
          toolCalls: [
            makeToolCall(
              "call_sem",
              "searchSemanticBooks",
              JSON.stringify({ query: "solidão no espaço" }),
            ),
          ],
          usage: { prompt: 150, completion: 25, total: 175 },
        }),
        makeCompletion({
          content:
            "Recomendo **Solaris** por Stanislaw Lem, um clássico sobre isolamento no espaço.",
          usage: { prompt: 260, completion: 30, total: 290 },
        }),
      ],
      {
        toolDeps: {
          searchSimilarBooks: searchSimilarMock,
        },
      },
    );

    const result = await processChatMessage(
      { token: "session-sem", message: "solidão no espaço" },
      deps,
    );

    expect(searchSimilarMock).toHaveBeenCalledWith("solidão no espaço", 5, 0.25);

    // Assert exact OpenAI message sequence passed to round 2
    const round2Messages = recordedCalls[1]?.messages ?? [];
    expect(round2Messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    const assistantTurn = round2Messages[2] as {
      role: string;
      tool_calls?: { id: string }[];
    };
    const toolTurn = round2Messages[3] as {
      role: string;
      tool_call_id?: string;
    };
    expect(assistantTurn.tool_calls?.[0]?.id).toBe("call_sem");
    expect(toolTurn.tool_call_id).toBe("call_sem");

    // Uncited book with similarity 0.85 MUST NOT be included
    expect(result.data.books).toHaveLength(1);
    expect(result.data.books[0]).toEqual({
      id: "solaris-id",
      title: "Solaris",
      author: "Stanislaw Lem",
      description: "Exploração sobre solidão no espaço.",
      coverUrl: "https://example.com/solaris.jpg",
      rating: 4.8,
      publishedAt: "1961-01-01T00:00:00.000Z",
      genres: [{ slug: "ficcao-cientifica", name: "Ficção Científica" }],
      similarity: 83,
    });
    expect(result.meta.usage).toEqual({
      promptTokens: 410,
      completionTokens: 55,
      totalTokens: 465,
    });

    const stored = getStored();
    expect(
      stored.messages.every(
        (m) => m.role === "user" || m.role === "assistant",
      ),
    ).toBe(true);
    expect(stored.messages).toHaveLength(2);
  });

  it("returns books: [] when semantic search finds no matches above threshold", async () => {
    const { deps } = createBaseDeps(
      [
        makeCompletion({
          toolCalls: [
            makeToolCall(
              "call_sem_empty",
              "searchSemanticBooks",
              JSON.stringify({ query: "receitas medievais de dragões" }),
            ),
          ],
          usage: { prompt: 100, completion: 20, total: 120 },
        }),
        makeCompletion({
          content:
            "Não encontrei livros sobre esse tema no acervo atual do Librarium.",
          usage: { prompt: 140, completion: 15, total: 155 },
        }),
      ],
      {
        toolDeps: {
          searchSimilarBooks: mock(async () => []),
        },
      },
    );

    const result = await processChatMessage(
      { token: "session-empty", message: "receitas medievais de dragões" },
      deps,
    );

    expect(result.data.books).toEqual([]);
  });

  it("executes structured searchBooks and omits similarity on cited books", async () => {
    const fundacao = makeStructuredBook({ id: "fund-1", title: "Fundação" });
    const listBooksMock = mock(async () => ({
      books: [fundacao],
      meta: { total: 1, page: 1, limit: 5, totalPages: 1 },
    }));

    const { deps } = createBaseDeps(
      [
        makeCompletion({
          toolCalls: [
            makeToolCall(
              "call_str",
              "searchBooks",
              JSON.stringify({ genre: "Ficção", minRating: 4.5 }),
            ),
          ],
          usage: { prompt: 110, completion: 20, total: 130 },
        }),
        makeCompletion({
          content: "Indico **Fundação** por Isaac Asimov, com ótima avaliação.",
          usage: { prompt: 200, completion: 25, total: 225 },
        }),
      ],
      {
        toolDeps: {
          listBooks: listBooksMock,
        },
      },
    );

    const result = await processChatMessage(
      { token: "session-str", message: "ficção nota > 4.5" },
      deps,
    );

    expect(listBooksMock).toHaveBeenCalledTimes(1);
    expect(result.data.books).toHaveLength(1);
    expect(result.data.books[0]?.title).toBe("Fundação");
    expect(result.data.books[0]?.similarity).toBeUndefined();
    expect("similarity" in result.data.books[0]!).toBe(false);
  });

  it("runs tools in parallel, deduplicates preserving highest similarity (even when higher appears first), and sums usage", async () => {
    const dunaStruct = makeStructuredBook({ id: "duna-id", title: "Duna" });
    const dunaSemHigh = makeSimilarBook({
      id: "duna-id",
      title: "Duna",
      similarity: 0.91,
    });
    const dunaSemLow = makeSimilarBook({
      id: "duna-id",
      title: "Duna",
      similarity: 0.62,
    });
    const solarisSem = makeSimilarBook({
      id: "solaris-id",
      title: "Solaris",
      similarity: 0.77,
    });
    const solarisStruct = makeStructuredBook({
      id: "solaris-id",
      title: "Solaris",
      author: "Stanislaw Lem",
    });

    let semanticRound = 0;
    let structRound = 0;
    const { deps } = createBaseDeps(
      [
        // Round 1: parallel calls (searchBooks + searchSemanticBooks returns 0.91 for Duna)
        makeCompletion({
          toolCalls: [
            makeToolCall(
              "call_1",
              "searchBooks",
              JSON.stringify({ genre: "ficcao" }),
            ),
            makeToolCall(
              "call_2",
              "searchSemanticBooks",
              JSON.stringify({ query: "política espacial" }),
            ),
          ],
          usage: { prompt: 100, completion: 30, total: 130 },
        }),
        // Round 2: semantic returns LOWER similarity 0.62 for Duna; structured returns Solaris
        makeCompletion({
          toolCalls: [
            makeToolCall(
              "call_3",
              "searchSemanticBooks",
              JSON.stringify({ query: "planeta desértico ecologia" }),
            ),
            makeToolCall(
              "call_4",
              "searchBooks",
              JSON.stringify({ title: "Solaris" }),
            ),
          ],
          usage: { prompt: 200, completion: 20, total: 220 },
        }),
        // Round 3: final synthesis
        makeCompletion({
          content:
            "Recomendo **Duna** por Frank Herbert e **Solaris** por Stanislaw Lem.",
          usage: { prompt: 300, completion: 40, total: 340 },
        }),
      ],
      {
        toolDeps: {
          listBooks: mock(async () => {
            structRound += 1;
            return {
              books: [structRound === 1 ? dunaStruct : solarisStruct],
              meta: { total: 1, page: 1, limit: 5, totalPages: 1 },
            };
          }),
          searchSimilarBooks: mock(async () => {
            semanticRound += 1;
            return semanticRound === 1
              ? [dunaSemHigh, solarisSem]
              : [dunaSemLow];
          }),
        },
      },
    );

    const result = await processChatMessage(
      { token: "session-multi", message: "ficção sobre ecologia e solidão" },
      deps,
    );

    expect(result.data.books).toHaveLength(2);
    const dunaCited = result.data.books.find((b) => b.id === "duna-id");
    const solarisCited = result.data.books.find((b) => b.id === "solaris-id");

    expect(dunaCited?.similarity).toBe(91);
    expect(solarisCited?.similarity).toBe(77);
    expect(result.meta.usage).toEqual({
      promptTokens: 600,
      completionTokens: 90,
      totalTokens: 690,
    });
  });

  it("forces 1 final call without tools after MAX_TOOL_ROUNDS exhaustion and returns empty books on fallback reply even if a book title matches fallback text", async () => {
    const acervoBook = makeStructuredBook({
      id: "acervo-id",
      title: "Acervo",
      author: "Autor Teste",
    });

    const toolRoundResponses = Array.from({ length: MAX_TOOL_ROUNDS }, (_, idx) =>
      makeCompletion({
        toolCalls: [
          makeToolCall(
            `call_${idx}`,
            "searchBooks",
            JSON.stringify({ query: `tentativa ${idx}` }),
          ),
        ],
        usage: { prompt: 50, completion: 10, total: 60 },
      }),
    );

    const finalFallbackResponse = makeCompletion({
      content: "   ", // Empty/whitespace reply triggers FALLBACK_EMPTY_REPLY (which contains word "acervo")
      usage: { prompt: 80, completion: 0, total: 80 },
    });

    const { deps, recordedCalls } = createBaseDeps(
      [...toolRoundResponses, finalFallbackResponse],
      {
        toolDeps: {
          listBooks: mock(async () => ({
            books: [acervoBook],
            meta: { total: 1, page: 1, limit: 5, totalPages: 1 },
          })),
        },
      },
    );

    const result = await processChatMessage(
      { token: "session-exhaust", message: "procure indefinidamente" },
      deps,
    );

    expect(recordedCalls).toHaveLength(MAX_TOOL_ROUNDS + 1);

    for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
      expect(recordedCalls[i]?.tools).toBeDefined();
      expect(recordedCalls[i]?.tool_choice).toBe("auto");
    }

    const lastCall = recordedCalls[MAX_TOOL_ROUNDS];
    expect(lastCall?.tools).toBeUndefined();
    expect(lastCall?.tool_choice).toBeUndefined();

    expect(result.data.modelReply).toBe(FALLBACK_EMPTY_REPLY);
    expect(result.data.modelReply.trim().length).toBeGreaterThan(0);
    expect(result.data.books).toEqual([]);
    expect(result.meta.usage).toEqual({
      promptTokens: MAX_TOOL_ROUNDS * 50 + 80,
      completionTokens: MAX_TOOL_ROUNDS * 10,
      totalTokens: MAX_TOOL_ROUNDS * 60 + 80,
    });
  });

  it("recovers gracefully without throwing when model sends invalid tool args or unknown tool", async () => {
    const { deps, recordedCalls } = createBaseDeps([
      makeCompletion({
        toolCalls: [
          makeToolCall("call_bad", "searchBooks", "{ broken json"),
          makeToolCall("call_unknown", "getBookDetails", "{}"),
        ],
        usage: { prompt: 100, completion: 20, total: 120 },
      }),
      makeCompletion({
        content: "Desculpe, houve um ajuste na consulta. Como posso ajudar?",
        usage: { prompt: 160, completion: 15, total: 175 },
      }),
    ]);

    const result = await processChatMessage(
      { token: "session-err", message: "me dê detalhes do livro" },
      deps,
    );

    expect(result.data.modelReply).toBe(
      "Desculpe, houve um ajuste na consulta. Como posso ajudar?",
    );
    expect(result.data.books).toEqual([]);

    const secondCallMessages = recordedCalls[1]?.messages ?? [];
    const toolMessages = secondCallMessages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(2);
    expect(String(toolMessages[0]?.content)).toContain("error");
    expect(String(toolMessages[1]?.content)).toContain("error");
  });

  it("matches short, accented, newline-wrapped, and regex-metacharacter titles with Unicode boundaries", async () => {
    expect(isBookCitedInReply("It", "Recomendo **It** de Stephen King!")).toBe(
      true,
    );
    expect(
      isBookCitedInReply("It", "Em Dom Casmurro, Capitu é protagonista."),
    ).toBe(false);
    expect(
      isBookCitedInReply(
        "A Revolução dos Bichos",
        "Um clássico imperdível é A Revolucao\ndos  Bichos de George Orwell.",
      ),
    ).toBe(true);
    expect(isBookCitedInReply("Café", "Experimente o livro Café.")).toBe(true);
    expect(isBookCitedInReply("Café", "O livro Cafeína é outro.")).toBe(false);
    expect(isBookCitedInReply("C++", "Aprenda com **C++** hoje!")).toBe(true);
    expect(isBookCitedInReply("C++", "Veja novidades de C++20.")).toBe(false);

    const itBook = makeStructuredBook({
      id: "it-id",
      title: "It",
      author: "Stephen King",
    });
    const orwellBook = makeStructuredBook({
      id: "orwell-id",
      title: "A Revolução dos Bichos",
      author: "George Orwell",
    });
    const cppBook = makeStructuredBook({
      id: "cpp-id",
      title: "C++",
      author: "Bjarne Stroustrup",
    });
    const capituBook = makeStructuredBook({
      id: "dom-id",
      title: "Dom Casmurro",
      author: "Machado de Assis",
    });

    const { deps } = createBaseDeps(
      [
        makeCompletion({
          toolCalls: [
            makeToolCall("call_titles", "searchBooks", JSON.stringify({})),
          ],
          usage: { prompt: 80, completion: 15, total: 95 },
        }),
        makeCompletion({
          content:
            "Para terror, leia **It** de Stephen King. Em ficção política, confira *A Revolucao\ndos Bichos*. Para programação, veja **C++**. Ah, e Capitu não aparece nesses.",
          usage: { prompt: 120, completion: 25, total: 145 },
        }),
      ],
      {
        toolDeps: {
          listBooks: mock(async () => ({
            books: [itBook, orwellBook, cppBook, capituBook],
            meta: { total: 4, page: 1, limit: 5, totalPages: 1 },
          })),
        },
      },
    );

    const result = await processChatMessage(
      { token: "session-unicode", message: "livros curtos e clássicos" },
      deps,
    );

    expect(result.data.books.map((b) => b.title)).toEqual([
      "It",
      "A Revolução dos Bichos",
      "C++",
    ]);
  });

  it("clamps similarity to [1, 100], omits non-finite similarity, and sanitizes invalid dates/ratings", async () => {
    const minClamped = makeSimilarBook({
      id: "min-id",
      title: "Livro Mínimo",
      similarity: 0.001,
      rating: Number.NaN,
      publishedAt: new Date("invalid"),
    });
    const maxClamped = makeSimilarBook({
      id: "max-id",
      title: "Livro Máximo",
      similarity: 1.2,
    });
    const nanSim = makeSimilarBook({
      id: "nan-id",
      title: "Livro NaN",
      similarity: Number.NaN,
    });

    const { deps } = createBaseDeps(
      [
        makeCompletion({
          toolCalls: [
            makeToolCall(
              "call_clamp",
              "searchSemanticBooks",
              JSON.stringify({ query: "teste" }),
            ),
          ],
        }),
        makeCompletion({
          content: "Veja **Livro Mínimo**, **Livro Máximo** e **Livro NaN**.",
        }),
      ],
      {
        toolDeps: {
          searchSimilarBooks: mock(async () => [minClamped, maxClamped, nanSim]),
        },
      },
    );

    const result = await processChatMessage(
      { token: "session-clamp", message: "teste" },
      deps,
    );

    expect(result.data.books).toHaveLength(3);
    expect(result.data.books[0]?.similarity).toBe(1);
    expect(result.data.books[0]?.rating).toBeNull();
    expect(result.data.books[0]?.publishedAt).toBeNull();
    expect(result.data.books[1]?.similarity).toBe(100);
    expect(result.data.books[2]?.similarity).toBeUndefined();
    expect("similarity" in result.data.books[2]!).toBe(false);
  });

  it("filters corrupted entries from Redis history while preserving valid user/assistant turns", async () => {
    const { deps, recordedCalls, setInitialRawRedisValue } = createBaseDeps([
      makeCompletion({
        content: "Claro, posso recomendar outros do mesmo autor.",
        usage: { prompt: 150, completion: 12, total: 162 },
      }),
    ]);

    setInitialRawRedisValue(
      JSON.stringify([
        null,
        { id: "bad-role", role: "tool", content: "ignored" },
        { id: "bad-content", role: "user", content: 123 },
        {
          id: "old-1",
          role: "user",
          content: "Gostei de Duna",
          createdAt: "2026-11-20T21:00:00.000Z",
        },
        {
          id: "old-2",
          role: "assistant",
          content: "É uma excelente obra de Frank Herbert!",
          createdAt: "2026-11-20T21:00:05.000Z",
        },
      ]),
    );

    await processChatMessage(
      { token: "session-hist", message: "Tem mais dele?" },
      deps,
    );

    const sentMessages = recordedCalls[0]?.messages ?? [];
    expect(sentMessages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(sentMessages[1]?.content).toBe("Gostei de Duna");
    expect(sentMessages[2]?.content).toBe(
      "É uma excelente obra de Frank Herbert!",
    );
    expect(sentMessages[3]?.content).toBe("Tem mais dele?");
  });
});
