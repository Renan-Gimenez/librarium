import { describe, expect, it, mock } from "bun:test";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

import type { BookWithGenres, SimilarBook } from "../book/book.service";
import {
  CHAT_TOOLS,
  executeChatToolCall,
  SEMANTIC_MIN_SIMILARITY,
} from "./chat.tools";

const makeToolCall = (
  name: string,
  args: string,
  id = "call_1",
): ChatCompletionMessageToolCall => ({
  id,
  type: "function",
  function: {
    name,
    arguments: args,
  },
});

const makeSimilarBook = (overrides: Partial<SimilarBook> = {}): SimilarBook => ({
  id: "book-sem-1",
  title: "Solaris",
  author: "Stanislaw Lem",
  description: "Solidão no espaço diante de um oceano consciente.",
  coverUrl: "https://example.com/solaris.jpg",
  rating: 4.7,
  publishedAt: new Date("1961-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  genres: [{ slug: "ficcao-cientifica", name: "Ficção Científica" }],
  similarity: 0.78,
  ...overrides,
});

const makeStructuredBook = (
  overrides: Partial<BookWithGenres> = {},
): BookWithGenres => ({
  id: "book-str-1",
  title: "Duna",
  author: "Frank Herbert",
  description: "Intriga política e ecologia em Arrakis.",
  coverUrl: "https://example.com/duna.jpg",
  rating: 4.9,
  publishedAt: new Date("1965-08-01T00:00:00.000Z"),
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

describe("chat.tools", () => {
  describe("CHAT_TOOLS", () => {
    it("exposes strictly searchSemanticBooks and searchBooks without getBookDetails or listGenres", () => {
      const toolNames = CHAT_TOOLS.map((tool) =>
        tool.type === "function" ? tool.function.name : tool.custom.name,
      );

      expect(toolNames).toEqual(["searchSemanticBooks", "searchBooks"]);
      expect(toolNames).not.toContain("getBookDetails");
      expect(toolNames).not.toContain("listGenres");
    });
  });

  describe("executeChatToolCall", () => {
    it("executes searchSemanticBooks with minSimilarity 0.25 and preserves similarity on candidates", async () => {
      const semanticBook = makeSimilarBook({ similarity: 0.81 });
      const searchSimilarMock = mock(async () => [semanticBook]);

      const result = await executeChatToolCall(
        makeToolCall(
          "searchSemanticBooks",
          JSON.stringify({ query: "solidão no espaço" }),
        ),
        { searchSimilarBooks: searchSimilarMock },
      );

      expect(searchSimilarMock).toHaveBeenCalledTimes(1);
      expect(searchSimilarMock).toHaveBeenCalledWith(
        "solidão no espaço",
        5,
        SEMANTIC_MIN_SIMILARITY,
      );
      expect(SEMANTIC_MIN_SIMILARITY).toBe(0.25);

      expect(result.toolCallId).toBe("call_1");
      expect(result.books).toHaveLength(1);
      expect(result.books[0]?.similarity).toBe(0.81);

      const parsedContent = JSON.parse(result.content) as {
        books: Record<string, unknown>[];
      };
      expect(parsedContent.books).toHaveLength(1);
      expect(parsedContent.books[0]?.title).toBe("Solaris");
      expect(parsedContent.books[0]?.similarity).toBeUndefined();
    });

    it("executes searchBooks with query, title, author, omits similarity, and includes all serialized fields plus total", async () => {
      const book = makeStructuredBook();
      const listBooksMock = mock(async () => ({
        books: [book],
        meta: { total: 12, page: 1, limit: 5, totalPages: 3 },
      }));

      const result = await executeChatToolCall(
        makeToolCall(
          "searchBooks",
          JSON.stringify({
            query: "ecologia",
            title: "Duna",
            author: "Herbert",
            genre: "Ficção",
            minRating: 4.5,
            sortBy: "rating",
            order: "desc",
          }),
        ),
        { listBooks: listBooksMock },
      );

      expect(listBooksMock).toHaveBeenCalledTimes(1);
      expect(listBooksMock).toHaveBeenCalledWith({
        search: "ecologia",
        title: "Duna",
        author: "Herbert",
        genre: "Ficção",
        minRating: 4.5,
        page: 1,
        limit: 5,
        sortBy: "rating",
        order: "desc",
      });

      expect(result.books).toHaveLength(1);
      expect(result.books[0]?.similarity).toBeUndefined();
      expect("similarity" in result.books[0]!).toBe(false);

      const parsedContent = JSON.parse(result.content) as {
        books: Record<string, unknown>[];
        total: number;
      };
      expect(parsedContent).toEqual({
        books: [
          {
            id: "book-str-1",
            title: "Duna",
            author: "Frank Herbert",
            description: "Intriga política e ecologia em Arrakis.",
            rating: 4.9,
            publishedAt: "1965-08-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            genres: ["Ficção"],
          },
        ],
        total: 12,
      });
    });

    it("accepts explicit null on optional and defaulted tool arguments", async () => {
      const searchSimilarMock = mock(async () => []);
      const listBooksMock = mock(async () => ({
        books: [],
        meta: { total: 0 },
      }));

      const semResult = await executeChatToolCall(
        makeToolCall(
          "searchSemanticBooks",
          JSON.stringify({ query: "solidão", limit: null }),
        ),
        { searchSimilarBooks: searchSimilarMock },
      );

      expect(searchSimilarMock).toHaveBeenCalledWith("solidão", 5, 0.25);
      expect(JSON.parse(semResult.content)).toEqual({ books: [] });

      const structResult = await executeChatToolCall(
        makeToolCall(
          "searchBooks",
          JSON.stringify({
            query: null,
            title: null,
            author: null,
            genre: "Ficção",
            minRating: null,
            sortBy: null,
            order: null,
            limit: null,
          }),
        ),
        { listBooks: listBooksMock },
      );

      expect(listBooksMock).toHaveBeenCalledWith({
        search: undefined,
        title: undefined,
        author: undefined,
        genre: "Ficção",
        minRating: undefined,
        page: 1,
        limit: 5,
        sortBy: "createdAt",
        order: "desc",
      });
      expect(JSON.parse(structResult.content)).toEqual({ books: [], total: 0 });
    });

    it("rejects extra unknown keys via strict schema validation without throwing", async () => {
      const semExtraResult = await executeChatToolCall(
        makeToolCall(
          "searchSemanticBooks",
          JSON.stringify({ query: "espaço", genre: "ficcao" }),
          "call_sem_extra",
        ),
      );

      expect(semExtraResult.books).toEqual([]);
      const semPayload = JSON.parse(semExtraResult.content) as {
        error?: string;
        details?: unknown[];
      };
      expect(semPayload.error).toContain("Invalid arguments");
      expect(semPayload.details?.length).toBeGreaterThan(0);

      const structExtraResult = await executeChatToolCall(
        makeToolCall(
          "searchBooks",
          JSON.stringify({ genre: "ficcao", hallucinatedField: true }),
          "call_struct_extra",
        ),
      );

      expect(structExtraResult.books).toEqual([]);
      const structPayload = JSON.parse(structExtraResult.content) as {
        error?: string;
        details?: unknown[];
      };
      expect(structPayload.error).toContain("Invalid arguments");
      expect(structPayload.details?.length).toBeGreaterThan(0);
    });

    it("safely serializes invalid dates, null genres, and non-finite ratings as null/empty", async () => {
      const weirdBook = {
        ...makeStructuredBook({
          publishedAt: new Date("invalid-date"),
          createdAt: "not-a-date" as unknown as Date,
          rating: Number.NaN,
        }),
        genres: null as unknown as BookWithGenres["genres"],
      };

      const result = await executeChatToolCall(
        makeToolCall("searchBooks", JSON.stringify({})),
        {
          listBooks: mock(async () => ({
            books: [weirdBook],
            meta: { total: 1 },
          })),
        },
      );

      expect(result.books).toHaveLength(1);
      expect(result.books[0]?.genres).toEqual([]);
      expect(result.books[0]?.rating).toBeNull();

      const parsed = JSON.parse(result.content) as {
        books: {
          publishedAt: string | null;
          createdAt: string | null;
          genres: string[];
          rating: number | null;
        }[];
      };
      expect(parsed.books[0]?.publishedAt).toBeNull();
      expect(parsed.books[0]?.createdAt).toBeNull();
      expect(parsed.books[0]?.genres).toEqual([]);
      expect(parsed.books[0]?.rating).toBeNull();
    });

    it("returns error JSON without throwing when arguments contain broken JSON", async () => {
      const result = await executeChatToolCall(
        makeToolCall("searchBooks", "{ broken json", "call_bad_json"),
      );

      expect(result.toolCallId).toBe("call_bad_json");
      expect(result.books).toEqual([]);
      const payload = JSON.parse(result.content) as { error?: string };
      expect(payload.error).toContain("Invalid JSON");
    });

    it("returns error JSON without throwing when Zod validation fails on searchSemanticBooks", async () => {
      const result = await executeChatToolCall(
        makeToolCall(
          "searchSemanticBooks",
          JSON.stringify({ query: "   ", limit: 25 }),
          "call_bad_zod_sem",
        ),
      );

      expect(result.toolCallId).toBe("call_bad_zod_sem");
      expect(result.books).toEqual([]);
      const payload = JSON.parse(result.content) as {
        error?: string;
        details?: unknown[];
      };
      expect(payload.error).toContain("Invalid arguments");
      expect(payload.details?.length).toBeGreaterThan(0);
    });

    it("returns error JSON without throwing when Zod validation fails on searchBooks", async () => {
      const result = await executeChatToolCall(
        makeToolCall(
          "searchBooks",
          JSON.stringify({ minRating: 9, sortBy: "unknown" }),
          "call_bad_zod_struct",
        ),
      );

      expect(result.toolCallId).toBe("call_bad_zod_struct");
      expect(result.books).toEqual([]);
      const payload = JSON.parse(result.content) as {
        error?: string;
        details?: unknown[];
      };
      expect(payload.error).toContain("Invalid arguments");
      expect(payload.details?.length).toBeGreaterThan(0);
    });

    it("returns error JSON without throwing for unknown tool names", async () => {
      const result = await executeChatToolCall(
        makeToolCall("getBookDetails", JSON.stringify({ bookId: "123" })),
      );

      expect(result.books).toEqual([]);
      const payload = JSON.parse(result.content) as { error?: string };
      expect(payload.error).toContain('Unknown tool "getBookDetails"');
    });

    it("returns error JSON without throwing for non-function custom tool calls", async () => {
      const customCall: ChatCompletionMessageToolCall = {
        id: "call_custom",
        type: "custom",
        custom: { name: "custom_tool", input: "hello" },
      };

      const result = await executeChatToolCall(customCall);

      expect(result.toolCallId).toBe("call_custom");
      expect(result.books).toEqual([]);
      const payload = JSON.parse(result.content) as { error?: string };
      expect(payload.error).toContain("Unsupported tool call type");
    });

    it("catches unexpected execution errors and returns sanitized error JSON without leaking internal error details", async () => {
      const result = await executeChatToolCall(
        makeToolCall("searchSemanticBooks", JSON.stringify({ query: "espaço" })),
        {
          searchSimilarBooks: mock(async () => {
            throw new Error("Vector DB offline");
          }),
        },
      );

      expect(result.books).toEqual([]);
      const payload = JSON.parse(result.content) as { error?: string };
      expect(payload.error).toBe(
        "Temporary error while querying the book catalog.",
      );
      expect(payload.error).not.toContain("Vector DB offline");
    });
  });
});
