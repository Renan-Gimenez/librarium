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
    it("exposes searchSemanticBooks, searchBooks (with date filters and total doc), getCatalogStats, and findSimilarBooks without getBookDetails or listGenres", () => {
      const toolNames = CHAT_TOOLS.map((tool) =>
        tool.type === "function" ? tool.function.name : tool.custom.name,
      );

      expect(toolNames).toEqual([
        "searchSemanticBooks",
        "searchBooks",
        "getCatalogStats",
        "findSimilarBooks",
      ]);
      expect(toolNames).not.toContain("getBookDetails");
      expect(toolNames).not.toContain("listGenres");

      const searchBooksTool = CHAT_TOOLS.find(
        (tool) => tool.type === "function" && tool.function.name === "searchBooks",
      );
      expect(searchBooksTool?.type).toBe("function");
      if (searchBooksTool?.type === "function") {
        expect(searchBooksTool.function.description).toContain("total");
        const properties = searchBooksTool.function.parameters
          ?.properties as Record<string, unknown>;
        expect(properties).toHaveProperty("publishedAfter");
        expect(properties).toHaveProperty("publishedBefore");
      }
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

    it("forwards single/double publishedAfter/publishedBefore in searchBooks, normalizes nulls, and rejects invalid dates or inverted intervals", async () => {
      const book = makeStructuredBook();
      const listBooksMock = mock(async () => ({
        books: [book],
        meta: { total: 4, page: 1, limit: 5, totalPages: 1 },
      }));

      const validResult = await executeChatToolCall(
        makeToolCall(
          "searchBooks",
          JSON.stringify({
            publishedAfter: "1960-01-01",
            publishedBefore: "1969-12-31",
          }),
        ),
        { listBooks: listBooksMock },
      );

      expect(listBooksMock).toHaveBeenCalledWith({
        search: undefined,
        title: undefined,
        author: undefined,
        genre: undefined,
        minRating: undefined,
        publishedAfter: "1960-01-01",
        publishedBefore: "1969-12-31",
        page: 1,
        limit: 5,
        sortBy: "createdAt",
        order: "desc",
      });
      expect(JSON.parse(validResult.content)).toMatchObject({ total: 4 });

      await executeChatToolCall(
        makeToolCall(
          "searchBooks",
          JSON.stringify({ publishedAfter: "1980-01-01", publishedBefore: null }),
        ),
        { listBooks: listBooksMock },
      );
      expect(listBooksMock).toHaveBeenNthCalledWith(2, {
        search: undefined,
        title: undefined,
        author: undefined,
        genre: undefined,
        minRating: undefined,
        publishedAfter: "1980-01-01",
        page: 1,
        limit: 5,
        sortBy: "createdAt",
        order: "desc",
      });

      await executeChatToolCall(
        makeToolCall(
          "searchBooks",
          JSON.stringify({ publishedAfter: null, publishedBefore: "1999-12-31" }),
        ),
        { listBooks: listBooksMock },
      );
      expect(listBooksMock).toHaveBeenNthCalledWith(3, {
        search: undefined,
        title: undefined,
        author: undefined,
        genre: undefined,
        minRating: undefined,
        publishedBefore: "1999-12-31",
        page: 1,
        limit: 5,
        sortBy: "createdAt",
        order: "desc",
      });

      await executeChatToolCall(
        makeToolCall(
          "searchBooks",
          JSON.stringify({ publishedAfter: null, publishedBefore: null }),
        ),
        { listBooks: listBooksMock },
      );
      expect(listBooksMock).toHaveBeenNthCalledWith(4, {
        search: undefined,
        title: undefined,
        author: undefined,
        genre: undefined,
        minRating: undefined,
        page: 1,
        limit: 5,
        sortBy: "createdAt",
        order: "desc",
      });

      const invertedResult = await executeChatToolCall(
        makeToolCall(
          "searchBooks",
          JSON.stringify({
            publishedAfter: "2020-01-01",
            publishedBefore: "2010-01-01",
          }),
        ),
      );
      expect(invertedResult.books).toEqual([]);
      const invertedPayload = JSON.parse(invertedResult.content) as {
        error?: string;
        details?: { path: string; message: string }[];
      };
      expect(invertedPayload.error).toContain("Invalid arguments");
      expect(invertedPayload.details?.length).toBeGreaterThan(0);

      for (const badDate of ["2020-02-31", "0000-01-01", "abc"]) {
        const badResult = await executeChatToolCall(
          makeToolCall("searchBooks", JSON.stringify({ publishedAfter: badDate })),
        );
        expect(badResult.books).toEqual([]);
        const badPayload = JSON.parse(badResult.content) as {
          error?: string;
          details?: unknown[];
        };
        expect(badPayload.error).toContain("Invalid arguments");
        expect(badPayload.details?.length).toBeGreaterThan(0);
      }
    });

    it("executes getCatalogStats for populated and empty catalogs and sanitizes unexpected DB errors", async () => {
      const populatedMock = mock(async () => ({
        totalBooks: 25,
        averageRating: 4.4,
        booksByGenre: [
          { slug: "ficcao-cientifica", name: "Ficção Científica", count: 10 },
        ],
        oldestPublishedAt: new Date("1949-06-08T00:00:00.000Z"),
        newestPublishedAt: new Date("2024-03-15T00:00:00.000Z"),
      }));

      const populatedRes = await executeChatToolCall(
        makeToolCall("getCatalogStats", JSON.stringify({})),
        { getCatalogStats: populatedMock },
      );

      expect(populatedMock).toHaveBeenCalledTimes(1);
      expect(populatedRes.books).toEqual([]);
      expect(JSON.parse(populatedRes.content)).toEqual({
        totalBooks: 25,
        averageRating: 4.4,
        booksByGenre: [
          { slug: "ficcao-cientifica", name: "Ficção Científica", count: 10 },
        ],
        oldestPublishedAt: "1949-06-08T00:00:00.000Z",
        newestPublishedAt: "2024-03-15T00:00:00.000Z",
      });

      const emptyRes = await executeChatToolCall(
        makeToolCall("getCatalogStats", JSON.stringify({})),
        {
          getCatalogStats: mock(async () => ({
            totalBooks: 0,
            averageRating: null,
            booksByGenre: [{ slug: "ficcao", name: "Ficção", count: 0 }],
            oldestPublishedAt: null,
            newestPublishedAt: null,
          })),
        },
      );

      expect(JSON.parse(emptyRes.content)).toEqual({
        totalBooks: 0,
        averageRating: null,
        booksByGenre: [{ slug: "ficcao", name: "Ficção", count: 0 }],
        oldestPublishedAt: null,
        newestPublishedAt: null,
      });

      const extraArgsRes = await executeChatToolCall(
        makeToolCall("getCatalogStats", JSON.stringify({ unexpected: true })),
      );
      expect(JSON.parse(extraArgsRes.content).error).toContain(
        "Invalid arguments",
      );

      const errorRes = await executeChatToolCall(
        makeToolCall("getCatalogStats", JSON.stringify({})),
        {
          getCatalogStats: mock(async () => {
            throw new Error("PostgreSQL connection refused");
          }),
        },
      );
      expect(JSON.parse(errorRes.content)).toEqual({
        error: "Temporary error while querying the book catalog.",
      });
    });

    it("executes findSimilarBooks by bookId preserving similarity on candidates without calling OpenAI or leaking similarity in text", async () => {
      const solaris = makeSimilarBook({
        id: "solaris-id",
        title: "Solaris",
        similarity: 0.87,
      });
      const findSimilarByIdMock = mock(async () => ({
        status: "ok" as const,
        sourceBook: { id: "duna-id", title: "Duna", author: "Frank Herbert" },
        books: [solaris],
      }));

      const result = await executeChatToolCall(
        makeToolCall(
          "findSimilarBooks",
          JSON.stringify({ bookId: "duna-id", limit: 3 }),
        ),
        { findSimilarBooksByBookId: findSimilarByIdMock },
      );

      expect(findSimilarByIdMock).toHaveBeenCalledWith("duna-id", 3, 0.25);
      expect(result.books).toHaveLength(1);
      expect(result.books[0]?.id).toBe("solaris-id");
      expect(result.books[0]?.similarity).toBe(0.87);

      const payload = JSON.parse(result.content) as {
        referenceBook: { id: string; title: string; author: string };
        books: Record<string, unknown>[];
      };
      expect(payload.referenceBook).toEqual({
        id: "duna-id",
        title: "Duna",
        author: "Frank Herbert",
      });
      expect(payload.books).toHaveLength(1);
      expect(payload.books[0]?.similarity).toBeUndefined();
    });

    it("resolves reference book by title (single call on exact normalized match, FTS fallback for diacritics, and partial fallback) in findSimilarBooks", async () => {
      const sequel = makeStructuredBook({
        id: "messias-id",
        title: "Messias de Duna",
      });
      const duna = makeStructuredBook({ id: "duna-id", title: "Duna" });
      const listBooksMock = mock(async () => ({
        books: [sequel, duna],
        meta: { total: 2 },
      }));
      const findSimilarByIdMock = mock(async () => ({
        status: "ok" as const,
        sourceBook: { id: "duna-id", title: "Duna", author: "Frank Herbert" },
        books: [makeSimilarBook({ id: "sol-id", similarity: 0.79 })],
      }));

      const result = await executeChatToolCall(
        makeToolCall(
          "findSimilarBooks",
          JSON.stringify({ title: "Duna", bookId: null, limit: null }),
        ),
        {
          listBooks: listBooksMock,
          findSimilarBooksByBookId: findSimilarByIdMock,
        },
      );

      expect(listBooksMock).toHaveBeenCalledTimes(1);
      expect(listBooksMock).toHaveBeenCalledWith({
        title: "Duna",
        page: 1,
        limit: 50,
        sortBy: "title",
        order: "asc",
      });
      expect(findSimilarByIdMock).toHaveBeenCalledWith("duna-id", 5, 0.25);
      expect(result.books).toHaveLength(1);
      expect(result.books[0]?.similarity).toBe(0.79);

      // Case/diacritic/extra-whitespace exact match via FTS fallback when title ILIKE misses accents
      const revolucao = makeStructuredBook({
        id: "rev-id",
        title: "A Revolução dos Bichos",
      });
      const ftsFallbackListMock = mock(
        async (query: Record<string, unknown>) => {
          if (query.title) {
            return { books: [], meta: { total: 0 } };
          }
          return {
            books: [
              makeStructuredBook({ id: "other-id", title: "Bichos" }),
              revolucao,
            ],
            meta: { total: 2 },
          };
        },
      );
      const findSimilarRevMock = mock(async () => ({
        status: "ok" as const,
        sourceBook: {
          id: "rev-id",
          title: "A Revolução dos Bichos",
          author: "George Orwell",
        },
        books: [],
      }));

      const ftsResolvedRes = await executeChatToolCall(
        makeToolCall(
          "findSimilarBooks",
          JSON.stringify({ title: "  a revolucao  dos bichos " }),
        ),
        {
          listBooks: ftsFallbackListMock,
          findSimilarBooksByBookId: findSimilarRevMock,
        },
      );

      expect(ftsFallbackListMock).toHaveBeenCalledTimes(2);
      expect(ftsFallbackListMock).toHaveBeenNthCalledWith(1, {
        title: "a revolucao dos bichos",
        page: 1,
        limit: 50,
        sortBy: "title",
        order: "asc",
      });
      expect(ftsFallbackListMock).toHaveBeenNthCalledWith(2, {
        search: "a revolucao dos bichos",
        page: 1,
        limit: 20,
        order: "desc",
      });
      expect(findSimilarRevMock).toHaveBeenCalledWith("rev-id", 5, 0.25);
      expect(JSON.parse(ftsResolvedRes.content)).toEqual({
        books: [],
        referenceBook: {
          id: "rev-id",
          title: "A Revolução dos Bichos",
          author: "George Orwell",
        },
        message:
          "Nenhum livro suficientemente similar foi encontrado no catálogo.",
      });

      // Partial fallback to titleBooks[0] when neither lookup yields an exact match
      const partialListMock = mock(async (query: Record<string, unknown>) => {
        if (query.title) {
          return { books: [sequel], meta: { total: 1 } };
        }
        return { books: [], meta: { total: 0 } };
      });
      await executeChatToolCall(
        makeToolCall("findSimilarBooks", JSON.stringify({ title: "Messias" })),
        {
          listBooks: partialListMock,
          findSimilarBooksByBookId: findSimilarByIdMock,
        },
      );
      expect(partialListMock).toHaveBeenCalledTimes(2);
      expect(findSimilarByIdMock).toHaveBeenLastCalledWith("messias-id", 5, 0.25);

      // Explicit null on optional title/limit when bookId is supplied
      await executeChatToolCall(
        makeToolCall(
          "findSimilarBooks",
          JSON.stringify({ bookId: "duna-id", title: null, limit: null }),
        ),
        { findSimilarBooksByBookId: findSimilarByIdMock },
      );
      expect(findSimilarByIdMock).toHaveBeenLastCalledWith("duna-id", 5, 0.25);
    });

    it("validates findSimilarBooks identifier requirement and handles not_found/no_embedding/errors cleanly", async () => {
      for (const emptyArgs of [
        {},
        { bookId: null, title: null },
        { bookId: "   ", title: "   " },
      ]) {
        const invalidRes = await executeChatToolCall(
          makeToolCall("findSimilarBooks", JSON.stringify(emptyArgs)),
        );
        expect(invalidRes.books).toEqual([]);
        const payload = JSON.parse(invalidRes.content) as {
          error?: string;
          details?: unknown[];
        };
        expect(payload.error).toContain("Invalid arguments");
        expect(payload.details?.length).toBeGreaterThan(0);
      }

      const titleNotFoundRes = await executeChatToolCall(
        makeToolCall("findSimilarBooks", JSON.stringify({ title: "Inexistente" })),
        {
          listBooks: mock(async () => ({ books: [], meta: { total: 0 } })),
          findSimilarBooksByBookId: mock(async () => {
            throw new Error("Should not be called when title lookup finds nothing");
          }),
        },
      );
      expect(titleNotFoundRes.books).toEqual([]);
      expect(JSON.parse(titleNotFoundRes.content)).toEqual({
        books: [],
        message: "Livro de referência não encontrado no catálogo.",
      });

      const notFoundRes = await executeChatToolCall(
        makeToolCall("findSimilarBooks", JSON.stringify({ bookId: "missing" })),
        {
          findSimilarBooksByBookId: mock(async () => ({
            status: "not_found" as const,
          })),
        },
      );
      expect(notFoundRes.books).toEqual([]);
      expect(JSON.parse(notFoundRes.content)).toEqual({
        books: [],
        message: "Livro de referência não encontrado no catálogo.",
      });

      const noEmbeddingRes = await executeChatToolCall(
        makeToolCall("findSimilarBooks", JSON.stringify({ bookId: "no-vec" })),
        {
          findSimilarBooksByBookId: mock(async () => ({
            status: "no_embedding" as const,
            sourceBook: { id: "no-vec", title: "Sem Vetor", author: "Autor" },
          })),
        },
      );
      expect(noEmbeddingRes.books).toEqual([]);
      expect(JSON.parse(noEmbeddingRes.content)).toEqual({
        books: [],
        referenceBook: { id: "no-vec", title: "Sem Vetor", author: "Autor" },
        message:
          "O livro de referência ainda não possui índice de similaridade disponível no catálogo.",
      });

      const dbErrorRes = await executeChatToolCall(
        makeToolCall("findSimilarBooks", JSON.stringify({ bookId: "duna-id" })),
        {
          findSimilarBooksByBookId: mock(async () => {
            throw new Error("pgvector internal failure");
          }),
        },
      );
      expect(dbErrorRes.books).toEqual([]);
      expect(JSON.parse(dbErrorRes.content)).toEqual({
        error: "Temporary error while querying the book catalog.",
      });
    });
  });
});
