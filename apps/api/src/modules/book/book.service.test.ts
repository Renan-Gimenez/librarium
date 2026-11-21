import { describe, expect, it, mock } from "bun:test";

import { Prisma } from "@/generated/prisma/client";

import { BookSchema } from "./book.routes";
import {
  buildPrefixTsQuery,
  createBook,
  findSimilarBooks,
  findSimilarBooksByBookId,
  getCatalogStats,
  listBooks,
  listBooksQuerySchema,
  parsePublishedDateBoundary,
  searchSimilarBooks,
  updateBook,
  type CreateBookTx,
  type UpdateBookTx,
  type BookWithGenres,
  type SimilarBook,
} from "./book.service";

const createTxSpy = <Tx>(
  runner: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>,
) => {
  const spy = mock(runner);
  const $transaction = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    spy(fn) as Promise<T>;
  return { spy, $transaction };
};

const makeBook = (overrides: Partial<BookWithGenres> = {}): BookWithGenres => ({
  id: "book-1",
  title: "Duna",
  author: "Frank Herbert",
  description: "Épico de ficção científica no planeta desértico Arrakis.",
  coverUrl: "https://example.com/duna.jpg",
  rating: 4.8,
  publishedAt: new Date("1965-08-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  genres: [
    {
      slug: "ficcao-cientifica",
      name: "Ficção Científica",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  ...overrides,
});

const makeSimilarBook = (
  overrides: Partial<SimilarBook> = {},
): SimilarBook => ({
  id: "book-1",
  title: "Solaris",
  author: "Stanislaw Lem",
  description: "Solidão e mistério em uma estação espacial sobre um oceano vivo.",
  coverUrl: null,
  rating: 4.7,
  publishedAt: new Date("1961-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  genres: [{ slug: "ficcao-cientifica", name: "Ficção Científica" }],
  similarity: 0.85,
  ...overrides,
});

describe("book.service", () => {
  describe("listBooks", () => {
    it("filters genre by slug or name case-insensitively and sorts rating with nulls last", async () => {
      const sampleBook = makeBook();
      const findManyMock = mock(async () => [sampleBook]);
      const countMock = mock(async () => 1);

      const result = await listBooks(
        {
          genre: "Ficção Científica",
          minRating: 4.5,
          page: 1,
          limit: 5,
          sortBy: "rating",
          order: "desc",
        },
        {
          prisma: {
            book: {
              findMany: findManyMock,
              count: countMock,
            },
          },
        },
      );

      expect(result.books).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 5,
        totalPages: 1,
      });

      expect(findManyMock).toHaveBeenCalledTimes(1);
      const findManyArgs = (findManyMock.mock.calls[0] as unknown[])[0] as {
        where: { AND: unknown[] };
        orderBy: Record<string, unknown>;
        skip: number;
        take: number;
      };

      expect(findManyArgs.where).toEqual({
        AND: [
          {
            genres: {
              some: {
                OR: [
                  { slug: { equals: "Ficção Científica", mode: "insensitive" } },
                  { name: { equals: "Ficção Científica", mode: "insensitive" } },
                ],
              },
            },
          },
          {
            rating: { gte: 4.5 },
          },
        ],
      });
      expect(findManyArgs.orderBy).toEqual({
        rating: { sort: "desc", nulls: "last" },
      });
      expect(findManyArgs.skip).toBe(0);
      expect(findManyArgs.take).toBe(5);
      expect(countMock).toHaveBeenCalledWith({ where: findManyArgs.where });
    });

    it("sorts publishedAt with nulls last and keeps plain sort for non-nullable title", async () => {
      const findManyMock = mock(async () => []);
      const countMock = mock(async () => 0);

      await listBooks(
        {
          page: 1,
          limit: 10,
          sortBy: "publishedAt",
          order: "asc",
        },
        {
          prisma: {
            book: { findMany: findManyMock, count: countMock },
          },
        },
      );

      const pubArgs = (findManyMock.mock.calls[0] as unknown[])[0] as {
        orderBy: Record<string, unknown>;
      };
      expect(pubArgs.orderBy).toEqual({
        publishedAt: { sort: "asc", nulls: "last" },
      });

      await listBooks(
        {
          page: 1,
          limit: 10,
          sortBy: "title",
          order: "asc",
        },
        {
          prisma: {
            book: { findMany: findManyMock, count: countMock },
          },
        },
      );

      const titleArgs = (findManyMock.mock.calls[1] as unknown[])[0] as {
        orderBy: Record<string, unknown>;
      };
      expect(titleArgs.orderBy).toEqual({ title: "asc" });
    });

    it("falls back safely to createdAt when sortBy is relevance without search", async () => {
      const findManyMock = mock(async () => []);
      const countMock = mock(async () => 0);

      await listBooks(
        {
          page: 1,
          limit: 10,
          sortBy: "relevance",
          order: "desc",
        },
        {
          prisma: {
            book: { findMany: findManyMock, count: countMock },
          },
        },
      );

      expect(findManyMock).toHaveBeenCalledTimes(1);
      const args = (findManyMock.mock.calls[0] as unknown[])[0] as {
        orderBy: Record<string, unknown>;
      };
      expect(args.orderBy).toEqual({ createdAt: "desc" });
    });

    it("builds prefix tsquery tokens for short terms, accents, combining marks, punctuation, caps at 32 tokens, and returns null when no alphanumeric tokens exist", () => {
      expect(buildPrefixTsQuery("It")).toBe("It:*");
      expect(buildPrefixTsQuery("Ficção cien")).toBe("Ficção:* & cien:*");
      expect(buildPrefixTsQuery("ficcao")).toBe("ficcao:*");
      expect(buildPrefixTsQuery("Ficc\u0327a\u0303o")).toBe("Ficção:*");
      expect(buildPrefixTsQuery("x\u0301y cafe\u0301\u0327")).toBe(
        "x\u0301y:* & caf\u0229\u0301:*",
      );
      expect(buildPrefixTsQuery("O'Reilly & Sons: (Vol. 2)!")).toBe(
        "O:* & Reilly:* & Sons:* & Vol:* & 2:*",
      );

      const fortyTokens = Array.from({ length: 40 }, (_, i) => `t${i + 1}`).join(
        " ",
      );
      const cappedResult = buildPrefixTsQuery(fortyTokens)!;
      const cappedParts = cappedResult.split(" & ");
      expect(cappedParts).toHaveLength(32);
      expect(cappedParts[0]).toBe("t1:*");
      expect(cappedParts[31]).toBe("t32:*");
      expect(cappedResult).not.toContain("t33:*");

      expect(buildPrefixTsQuery("!!! ---")).toBeNull();
      expect(buildPrefixTsQuery("   ")).toBeNull();
      expect(buildPrefixTsQuery("")).toBeNull();
    });

    it("defaults to createdAt desc in Prisma path when both search and sortBy are omitted via listBooksQuerySchema", async () => {
      const findManyMock = mock(async () => []);
      const countMock = mock(async () => 0);

      await listBooks(listBooksQuerySchema.parse({}), {
        prisma: {
          book: { findMany: findManyMock, count: countMock },
        },
      });

      expect(findManyMock).toHaveBeenCalledTimes(1);
      const args = (findManyMock.mock.calls[0] as unknown[])[0] as {
        orderBy: Record<string, unknown>;
      };
      expect(args.orderBy).toEqual({ createdAt: "desc" });
    });

    it("accepts relevance in listBooksQuerySchema and keeps omitted sortBy undefined", () => {
      const withRelevance = listBooksQuerySchema.parse({
        sortBy: "relevance",
      });
      expect(withRelevance.sortBy).toBe("relevance");

      const withoutSortBy = listBooksQuerySchema.parse({
        search: "duna",
      });
      expect(withoutSortBy.sortBy).toBeUndefined();

      expect(() =>
        listBooksQuerySchema.parse({ sortBy: "invalid" }),
      ).toThrow();
    });

    it("returns empty paginated response without querying DB when search has only punctuation", async () => {
      const findManyMock = mock(async () => []);
      const countMock = mock(async () => 0);
      const queryRawMock = mock(
        async (_query: TemplateStringsArray | Prisma.Sql, ..._values: unknown[]) => [],
      );

      const result = await listBooks(
        {
          search: "!!! ---",
          page: 2,
          limit: 5,
          order: "desc",
        },
        {
          prisma: {
            book: { findMany: findManyMock, count: countMock },
            $queryRaw: <T = unknown>(
              query: TemplateStringsArray | Prisma.Sql,
              ...values: unknown[]
            ) => queryRawMock(query, ...values) as Promise<T>,
          },
        },
      );

      expect(result).toEqual({
        books: [],
        meta: {
          total: 0,
          page: 2,
          limit: 5,
          totalPages: 0,
        },
      });
      expect(findManyMock).not.toHaveBeenCalled();
      expect(countMock).not.toHaveBeenCalled();
      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it("executes parameterized FTS with simple + public.unaccent, default ts_rank_cd DESC, parallel COUNT(*), and hydrates Date fields for BookSchema", async () => {
      const findManyMock = mock(async () => []);
      const countMock = mock(async () => 0);
      const capturedQueries: { sql: string; values: unknown[] }[] = [];
      let rawContextTag: string | undefined;

      const rawRows = [
        {
          id: "book-it",
          title: "It",
          author: "Stephen King",
          description: "Romance de terror em Derry.",
          coverUrl: null,
          rating: 4.7,
          publishedAt: "1986-09-15T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          genres: [
            {
              slug: "terror",
              name: "Terror",
              createdAt: "2026-01-01T00:00:00+00:00",
              updatedAt: "2026-01-02T00:00:00+00:00",
            },
          ],
        },
      ];

      const fakePrisma = {
        contextTag: "fts-prisma",
        book: { findMany: findManyMock, count: countMock },
        async $queryRaw<T = unknown>(
          this: { contextTag?: string },
          query: TemplateStringsArray | Prisma.Sql,
        ): Promise<T> {
          rawContextTag = this?.contextTag;
          const sqlObj = query as Prisma.Sql;
          capturedQueries.push({
            sql: sqlObj.sql,
            values: [...sqlObj.values],
          });

          if (sqlObj.sql.includes("COUNT(*)")) {
            return [{ total: BigInt(1) }] as T;
          }
          return rawRows as T;
        },
      };

      const result = await listBooks(
        {
          search: "It",
          page: 1,
          limit: 10,
          order: "desc",
        },
        { prisma: fakePrisma },
      );

      expect(rawContextTag).toBe("fts-prisma");
      expect(findManyMock).not.toHaveBeenCalled();
      expect(countMock).not.toHaveBeenCalled();
      expect(capturedQueries).toHaveLength(2);

      const dataQuery = capturedQueries.find((q) =>
        q.sql.includes("ts_rank_cd"),
      )!;
      const countQuery = capturedQueries.find((q) =>
        q.sql.includes("COUNT(*)"),
      )!;

      expect(dataQuery).toBeDefined();
      expect(countQuery).toBeDefined();
      expect(dataQuery.sql).not.toContain("ILIKE");
      expect(dataQuery.sql).toContain(
        `b."search_vector" @@ to_tsquery('simple', public.unaccent(?))`,
      );
      expect(dataQuery.sql).toContain(
        `ts_rank_cd(\n          b."search_vector",\n          to_tsquery('simple', public.unaccent(?))\n        )`,
      );
      expect(dataQuery.sql).toContain(
        `ORDER BY "rank" DESC, b."createdAt" DESC, b."id" ASC`,
      );
      expect(dataQuery.values).toContain("It:*");
      expect(dataQuery.values).toContain(10);
      expect(dataQuery.values).toContain(0);

      expect(countQuery.sql).toContain(
        `b."search_vector" @@ to_tsquery('simple', public.unaccent(?))`,
      );
      expect(countQuery.values).toEqual(["It:*"]);

      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(result.books).toHaveLength(1);
      expect(result.books[0]?.publishedAt).toBeInstanceOf(Date);
      expect(result.books[0]?.createdAt).toBeInstanceOf(Date);
      expect(result.books[0]?.updatedAt).toBeInstanceOf(Date);
      expect(result.books[0]?.genres[0]?.createdAt).toBeInstanceOf(Date);
      expect(result.books[0]?.genres[0]?.updatedAt).toBeInstanceOf(Date);

      // Ensure hydrated objects pass BookSchema strictly
      expect(() => BookSchema.parse(result.books[0])).not.toThrow();
    });

    it("supports explicit sortBy with rank DESC tie-breaker and combines filters + pagination in parallel COUNT(*)", async () => {
      const capturedQueries: { sql: string; values: unknown[] }[] = [];

      const queryRawMock = mock(
        async (query: TemplateStringsArray | Prisma.Sql) => {
          const sqlObj = query as Prisma.Sql;
          capturedQueries.push({
            sql: sqlObj.sql,
            values: [...sqlObj.values],
          });

          if (sqlObj.sql.includes("COUNT(*)")) {
            return [{ total: 12 }];
          }
          return [];
        },
      );

      const queryRawWrapper = <T = unknown>(
        query: TemplateStringsArray | Prisma.Sql,
      ) => queryRawMock(query) as Promise<T>;

      const ratingRes = await listBooks(
        {
          search: "O'Reilly & Sons: (Vol. 2)!",
          title: "Duna",
          author: "Frank",
          genre: "ficcao-cientifica",
          minRating: 4.5,
          page: 2,
          limit: 5,
          sortBy: "rating",
          order: "desc",
        },
        { prisma: { $queryRaw: queryRawWrapper } },
      );

      expect(ratingRes.meta).toEqual({
        total: 12,
        page: 2,
        limit: 5,
        totalPages: 3,
      });

      const dataQuery = capturedQueries[0]!;
      const countQuery = capturedQueries[1]!;

      expect(dataQuery.sql).toContain(
        `ORDER BY b."rating" DESC NULLS LAST, "rank" DESC, b."createdAt" DESC, b."id" ASC`,
      );
      expect(dataQuery.sql).toContain("LIMIT ?\n      OFFSET ?");
      expect(dataQuery.values).toEqual([
        "O:* & Reilly:* & Sons:* & Vol:* & 2:*",
        "O:* & Reilly:* & Sons:* & Vol:* & 2:*",
        "Duna",
        "Frank",
        "ficcao-cientifica",
        "ficcao-cientifica",
        4.5,
        5,
        5,
      ]);

      expect(countQuery.values).toEqual([
        "O:* & Reilly:* & Sons:* & Vol:* & 2:*",
        "Duna",
        "Frank",
        "ficcao-cientifica",
        "ficcao-cientifica",
        4.5,
      ]);

      capturedQueries.length = 0;

      await listBooks(
        {
          search: "Ficção cien",
          page: 1,
          limit: 10,
          sortBy: "createdAt",
          order: "desc",
        },
        { prisma: { $queryRaw: queryRawWrapper } },
      );

      expect(capturedQueries[0]?.sql).toContain(
        `ORDER BY b."createdAt" DESC, "rank" DESC, b."id" ASC`,
      );
      expect(capturedQueries[0]?.values).toContain("Ficção:* & cien:*");

      capturedQueries.length = 0;

      await listBooks(
        {
          search: "duna",
          page: 1,
          limit: 10,
          sortBy: "relevance",
          order: "asc",
        },
        { prisma: { $queryRaw: queryRawWrapper } },
      );

      expect(capturedQueries[0]?.sql).toContain(
        `ORDER BY "rank" DESC, b."createdAt" DESC, b."id" ASC`,
      );
    });

    it("validates publishedAfter/publishedBefore dates, prevents calendar rollover, rejects inverted intervals, and preserves ISO timestamps", () => {
      expect(
        parsePublishedDateBoundary("1960-01-01", "start")?.toISOString(),
      ).toBe("1960-01-01T00:00:00.000Z");
      expect(
        parsePublishedDateBoundary("1969-12-31", "end")?.toISOString(),
      ).toBe("1969-12-31T23:59:59.999Z");
      expect(
        parsePublishedDateBoundary(
          "1965-08-01T14:30:00.000Z",
          "end",
        )?.toISOString(),
      ).toBe("1965-08-01T14:30:00.000Z");
      expect(
        parsePublishedDateBoundary(
          "1965-08-01T12:00:00-03:00",
          "start",
        )?.toISOString(),
      ).toBe("1965-08-01T15:00:00.000Z");

      // Calendar rollover, year < 1, and invalid formats
      expect(parsePublishedDateBoundary("2020-02-31", "start")).toBeNull();
      expect(parsePublishedDateBoundary("2021-02-29", "start")).toBeNull();
      expect(parsePublishedDateBoundary("2020-04-31", "end")).toBeNull();
      expect(
        parsePublishedDateBoundary("2020-02-31T00:00:00Z", "start"),
      ).toBeNull();
      expect(parsePublishedDateBoundary("0000-01-01", "start")).toBeNull();
      expect(parsePublishedDateBoundary("0000-02-29", "end")).toBeNull();
      expect(
        parsePublishedDateBoundary("0001-01-01T00:00:00+05:00", "start"),
      ).toBeNull();
      expect(parsePublishedDateBoundary("abc", "start")).toBeNull();

      // Early CE dates (year 0001..0099) must not map to 1900..1999
      const leap96 = parsePublishedDateBoundary("0096-02-29", "start");
      expect(leap96?.getUTCFullYear()).toBe(96);
      expect(leap96?.getUTCMonth()).toBe(1);
      expect(leap96?.getUTCDate()).toBe(29);
      expect(parsePublishedDateBoundary("0095-02-29", "start")).toBeNull();

      // Same-day YYYY-MM-DD range is inclusive and valid
      expect(
        listBooksQuerySchema.parse({
          publishedAfter: "2020-02-29",
          publishedBefore: "2020-02-29",
        }),
      ).toMatchObject({
        publishedAfter: "2020-02-29",
        publishedBefore: "2020-02-29",
      });

      // Invalid dates, year 0000, UTC rollover < 1, and inverted ranges rejected by Zod
      expect(() =>
        listBooksQuerySchema.parse({ publishedAfter: "2020-02-31" }),
      ).toThrow();
      expect(() =>
        listBooksQuerySchema.parse({ publishedAfter: "0000-01-01" }),
      ).toThrow();
      expect(() =>
        listBooksQuerySchema.parse({
          publishedAfter: "0001-01-01T00:00:00+05:00",
        }),
      ).toThrow();
      expect(() =>
        listBooksQuerySchema.parse({ publishedBefore: "abc" }),
      ).toThrow();
      expect(() =>
        listBooksQuerySchema.parse({
          publishedAfter: "2020-01-01",
          publishedBefore: "2010-01-01",
        }),
      ).toThrow();
      expect(() =>
        listBooksQuerySchema.parse({
          publishedAfter: "2020-01-01T12:00:00Z",
          publishedBefore: "2020-01-01T11:59:59Z",
        }),
      ).toThrow();
    });

    it("applies inclusive single-bound and double-bound publishedAfter/publishedBefore filters in Prisma path", async () => {
      const findManyMock = mock(async () => [makeBook()]);
      const countMock = mock(async () => 1);

      await listBooks(
        {
          publishedAfter: "1960-01-01",
          publishedBefore: "1969-12-31",
          page: 1,
          limit: 10,
          order: "desc",
        },
        {
          prisma: {
            book: { findMany: findManyMock, count: countMock },
          },
        },
      );

      const bothArgs = (findManyMock.mock.calls[0] as unknown[])[0] as {
        where: { AND: unknown[] };
      };
      expect(bothArgs.where).toEqual({
        AND: [
          {
            publishedAt: {
              gte: new Date("1960-01-01T00:00:00.000Z"),
              lte: new Date("1969-12-31T23:59:59.999Z"),
            },
          },
        ],
      });
      expect(countMock).toHaveBeenCalledWith({ where: bothArgs.where });

      await listBooks(
        {
          publishedAfter: "1980-01-01",
          page: 1,
          limit: 10,
          order: "desc",
        },
        {
          prisma: {
            book: { findMany: findManyMock, count: countMock },
          },
        },
      );

      const afterOnlyArgs = (findManyMock.mock.calls[1] as unknown[])[0] as {
        where: { AND: unknown[] };
      };
      expect(afterOnlyArgs.where).toEqual({
        AND: [
          {
            publishedAt: {
              gte: new Date("1980-01-01T00:00:00.000Z"),
            },
          },
        ],
      });

      await listBooks(
        {
          publishedBefore: "1999-12-31",
          page: 1,
          limit: 10,
          order: "desc",
        },
        {
          prisma: {
            book: { findMany: findManyMock, count: countMock },
          },
        },
      );

      const beforeOnlyArgs = (findManyMock.mock.calls[2] as unknown[])[0] as {
        where: { AND: unknown[] };
      };
      expect(beforeOnlyArgs.where).toEqual({
        AND: [
          {
            publishedAt: {
              lte: new Date("1999-12-31T23:59:59.999Z"),
            },
          },
        ],
      });
    });

    it("applies inclusive single-bound and double-bound publishedAfter/publishedBefore filters in FTS path for both data and COUNT(*)", async () => {
      const capturedQueries: { sql: string; values: unknown[] }[] = [];

      const queryRawMock = mock(
        async (query: TemplateStringsArray | Prisma.Sql) => {
          const sqlObj = query as Prisma.Sql;
          capturedQueries.push({
            sql: sqlObj.sql,
            values: [...sqlObj.values],
          });
          if (sqlObj.sql.includes("COUNT(*)")) {
            return [{ total: 1 }];
          }
          return [];
        },
      );

      const ftsPrisma = {
        $queryRaw: <T = unknown>(query: TemplateStringsArray | Prisma.Sql) =>
          queryRawMock(query) as Promise<T>,
      };

      await listBooks(
        {
          search: "duna",
          publishedAfter: "1960-01-01",
          publishedBefore: "1969-12-31T15:30:00.000Z",
          page: 1,
          limit: 5,
          order: "desc",
        },
        { prisma: ftsPrisma },
      );

      const dataQuery = capturedQueries[0]!;
      const countQuery = capturedQueries[1]!;

      expect(dataQuery.sql).toContain('b."publishedAt" >= ?');
      expect(dataQuery.sql).toContain('b."publishedAt" <= ?');
      expect(dataQuery.values).toContainEqual(
        new Date("1960-01-01T00:00:00.000Z"),
      );
      expect(dataQuery.values).toContainEqual(
        new Date("1969-12-31T15:30:00.000Z"),
      );

      expect(countQuery.sql).toContain('b."publishedAt" >= ?');
      expect(countQuery.sql).toContain('b."publishedAt" <= ?');
      expect(countQuery.values).toContainEqual(
        new Date("1960-01-01T00:00:00.000Z"),
      );
      expect(countQuery.values).toContainEqual(
        new Date("1969-12-31T15:30:00.000Z"),
      );

      capturedQueries.length = 0;

      await listBooks(
        {
          search: "duna",
          publishedAfter: "1980-01-01",
          page: 1,
          limit: 5,
          order: "desc",
        },
        { prisma: ftsPrisma },
      );

      expect(capturedQueries[0]?.sql).toContain('b."publishedAt" >= ?');
      expect(capturedQueries[0]?.sql).not.toContain('b."publishedAt" <= ?');
      expect(capturedQueries[1]?.sql).toContain('b."publishedAt" >= ?');
      expect(capturedQueries[1]?.sql).not.toContain('b."publishedAt" <= ?');
      expect(capturedQueries[1]?.values).toContainEqual(
        new Date("1980-01-01T00:00:00.000Z"),
      );

      capturedQueries.length = 0;

      await listBooks(
        {
          search: "duna",
          publishedBefore: "1999-12-31",
          page: 1,
          limit: 5,
          order: "desc",
        },
        { prisma: ftsPrisma },
      );

      expect(capturedQueries[0]?.sql).not.toContain('b."publishedAt" >= ?');
      expect(capturedQueries[0]?.sql).toContain('b."publishedAt" <= ?');
      expect(capturedQueries[1]?.sql).not.toContain('b."publishedAt" >= ?');
      expect(capturedQueries[1]?.sql).toContain('b."publishedAt" <= ?');
      expect(capturedQueries[1]?.values).toContainEqual(
        new Date("1999-12-31T23:59:59.999Z"),
      );
    });
  });

  describe("createBook", () => {
    it("deduplicates genreSlugs in a single query, generates embedding before $transaction, and persists book + vector atomically via tx.$executeRaw", async () => {
      const callOrder: string[] = [];
      const createdBook = makeBook({
        id: "new-book-1",
        genres: [
          {
            slug: "ficcao-cientifica",
            name: "Ficção Científica",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
          {
            slug: "aventura",
            name: "Aventura",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      });

      const findGenresMock = mock(async () => {
        callOrder.push("genre.findMany");
        return [
          { slug: "ficcao-cientifica", name: "Ficção Científica" },
          { slug: "aventura", name: "Aventura" },
        ];
      });

      const genEmbeddingMock = mock(async () => {
        callOrder.push("generateEmbedding");
        return [0.11, 0.22, 0.33];
      });

      let rawContextTag: string | undefined;
      let capturedSql = "";
      let capturedValues: unknown[] = [];

      const txBookCreateMock = mock(async () => {
        callOrder.push("tx.book.create");
        return createdBook;
      });

      const fakeTx: CreateBookTx & { contextTag: string } = {
        contextTag: "tx-bound",
        book: {
          create: txBookCreateMock,
        },
        async $executeRaw(
          this: { contextTag?: string },
          strings: TemplateStringsArray,
          ...values: unknown[]
        ) {
          callOrder.push("tx.$executeRaw");
          rawContextTag = this?.contextTag;
          capturedSql = strings.join("?");
          capturedValues = values;
          return 1;
        },
      };

      const outerBookCreateMock = mock(async () => {
        throw new Error("Should not call outer prisma.book.create directly");
      });

      const { spy: transactionMock, $transaction } = createTxSpy<CreateBookTx>(
        async (fn) => {
          callOrder.push("$transaction:start");
          const result = await fn(fakeTx);
          callOrder.push("$transaction:end");
          return result;
        },
      );

      const result = await createBook(
        {
          title: "Duna",
          author: "Frank Herbert",
          description: "Épico no planeta Arrakis.",
          genreSlugs: ["ficcao-cientifica", "ficcao-cientifica", "aventura"],
        },
        {
          prisma: {
            book: { create: outerBookCreateMock },
            genre: { findMany: findGenresMock },
            $transaction,
          },
          generateEmbedding: genEmbeddingMock,
        },
      );

      expect(result).toEqual(createdBook);
      expect(findGenresMock).toHaveBeenCalledTimes(1);
      expect(findGenresMock).toHaveBeenCalledWith({
        where: { slug: { in: ["ficcao-cientifica", "aventura"] } },
      });
      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).toContain("Gêneros: Ficção Científica, Aventura");
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(outerBookCreateMock).not.toHaveBeenCalled();

      const createArgs = (txBookCreateMock.mock.calls[0] as unknown[])[0] as {
        data: { genres: { connect: { slug: string }[] } };
      };
      expect(createArgs.data.genres.connect).toEqual([
        { slug: "ficcao-cientifica" },
        { slug: "aventura" },
      ]);

      expect(rawContextTag).toBe("tx-bound");
      expect(capturedSql).toContain('UPDATE "books"');
      expect(capturedValues).toEqual(["[0.11,0.22,0.33]", "new-book-1"]);
      expect(callOrder).toEqual([
        "genre.findMany",
        "generateEmbedding",
        "$transaction:start",
        "tx.book.create",
        "tx.$executeRaw",
        "$transaction:end",
      ]);
    });

    it("skips genre query when genreSlugs is empty and still creates book and embedding atomically", async () => {
      const findGenresMock = mock(async () => []);
      const genEmbeddingMock = mock(async () => [0.5, 0.5]);
      const saveEmbeddingMock = mock(async () => undefined);
      const txBookCreateMock = mock(async () =>
        makeBook({ id: "book-empty-genres", genres: [] }),
      );
      const { $transaction } = createTxSpy<CreateBookTx>(async (fn) =>
        fn({ book: { create: txBookCreateMock } }),
      );

      const result = await createBook(
        {
          title: "Sem Gênero",
          author: "Autor Teste",
          genreSlugs: [],
        },
        {
          prisma: {
            genre: { findMany: findGenresMock },
            $transaction,
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(result.id).toBe("book-empty-genres");
      expect(findGenresMock).not.toHaveBeenCalled();
      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(saveEmbeddingMock).toHaveBeenCalledWith("book-empty-genres", [
        0.5, 0.5,
      ]);
    });

    it("aborts before calling generateEmbedding or $transaction when any genreSlug does not exist", async () => {
      const findGenresMock = mock(async () => [
        { slug: "ficcao-cientifica", name: "Ficção Científica" },
      ]);
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const { spy: transactionMock, $transaction } = createTxSpy<CreateBookTx>(
        async (fn) => fn({ book: { create: mock(async () => makeBook()) } }),
      );

      await expect(
        createBook(
          {
            title: "Livro Inválido",
            author: "Autor",
            genreSlugs: ["ficcao-cientifica", "genero-inexistente"],
          },
          {
            prisma: {
              genre: { findMany: findGenresMock },
              $transaction,
            },
            generateEmbedding: genEmbeddingMock,
          },
        ),
      ).rejects.toThrow("Genre(s) not found: genero-inexistente");

      expect(findGenresMock).toHaveBeenCalledTimes(1);
      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("propagates generateEmbedding errors without opening $transaction", async () => {
      const { spy: transactionMock, $transaction } = createTxSpy<CreateBookTx>(
        async (fn) => fn({ book: { create: mock(async () => makeBook()) } }),
      );

      await expect(
        createBook(
          {
            title: "Livro",
            author: "Autor",
            genreSlugs: [],
          },
          {
            prisma: {
              genre: { findMany: mock(async () => []) },
              $transaction,
            },
            generateEmbedding: mock(async () => {
              throw new Error("OpenAI rate limit");
            }),
          },
        ),
      ).rejects.toThrow("OpenAI rate limit");

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("rolls back $transaction and propagates error when saveBookEmbedding fails after tx.book.create", async () => {
      const committedBooks: BookWithGenres[] = [];
      let rolledBack = false;

      const { spy: transactionMock, $transaction } = createTxSpy<CreateBookTx>(
        async (fn) => {
          const stagedBooks: BookWithGenres[] = [];
          const tx: CreateBookTx = {
            book: {
              create: mock(async () => {
                const created = makeBook({ id: "orphan-candidate" });
                stagedBooks.push(created);
                return created;
              }),
            },
            $executeRaw: mock(async () => {
              throw new Error("Vector write failed");
            }),
          };

          try {
            const result = await fn(tx);
            committedBooks.push(...stagedBooks);
            return result;
          } catch (err) {
            rolledBack = true;
            throw err;
          }
        },
      );

      await expect(
        createBook(
          {
            title: "Livro Órfão",
            author: "Autor",
            genreSlugs: [],
          },
          {
            prisma: {
              genre: { findMany: mock(async () => []) },
              $transaction,
            },
            generateEmbedding: mock(async () => [0.9, 0.1]),
          },
        ),
      ).rejects.toThrow("Vector write failed");

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(rolledBack).toBe(true);
      expect(committedBooks).toHaveLength(0);
    });

    it("throws when $transaction supplies tx without $executeRaw and no custom saveBookEmbedding is injected", async () => {
      const outerExecuteRawMock = mock(async () => 1);
      const { spy: transactionMock, $transaction } = createTxSpy<CreateBookTx>(
        async (fn) =>
          fn({
            book: {
              create: mock(async () => makeBook({ id: "missing-raw-tx" })),
            },
          }),
      );

      await expect(
        createBook(
          {
            title: "Sem $executeRaw no tx",
            author: "Autor",
            genreSlugs: [],
          },
          {
            prisma: {
              genre: { findMany: mock(async () => []) },
              $executeRaw: outerExecuteRawMock,
              $transaction,
            },
            generateEmbedding: mock(async () => [0.3, 0.7]),
          },
        ),
      ).rejects.toThrow("Transaction client must provide $executeRaw");

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(outerExecuteRawMock).not.toHaveBeenCalled();
    });
  });

  describe("updateBook", () => {
    it("returns null without generating embedding when book does not exist", async () => {
      const findUniqueMock = mock(async () => null);
      const updateMock = mock(async () => makeBook());
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const saveEmbeddingMock = mock(async () => undefined);

      const result = await updateBook(
        "missing-id",
        { title: "Novo Título" },
        {
          prisma: {
            book: { findUnique: findUniqueMock, update: updateMock },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(result).toBeNull();
      expect(updateMock).not.toHaveBeenCalled();
      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(saveEmbeddingMock).not.toHaveBeenCalled();
    });

    it("skips generateEmbedding and saveBookEmbedding on partial update with only rating", async () => {
      const existing = makeBook({ rating: 4.0 });
      const updated = makeBook({ rating: 4.9 });
      const updateMock = mock(async () => updated);
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const saveEmbeddingMock = mock(async () => undefined);

      const result = await updateBook(
        existing.id,
        { rating: 4.9 },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: updateMock,
            },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(result).toEqual(updated);
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(saveEmbeddingMock).not.toHaveBeenCalled();
    });

    it("skips generateEmbedding and saveBookEmbedding on partial update with only coverUrl", async () => {
      const existing = makeBook();
      const updated = makeBook({ coverUrl: "https://example.com/new-cover.jpg" });
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const saveEmbeddingMock = mock(async () => undefined);

      const result = await updateBook(
        existing.id,
        { coverUrl: "https://example.com/new-cover.jpg" },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => updated),
            },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(result).toEqual(updated);
      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(saveEmbeddingMock).not.toHaveBeenCalled();
    });

    it("skips embedding regeneration when indexable fields are passed with identical values (including null description)", async () => {
      const existing = makeBook({ description: null });
      const updated = makeBook({ description: null, rating: 5.0 });
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const saveEmbeddingMock = mock(async () => undefined);

      await updateBook(
        existing.id,
        {
          title: existing.title,
          author: existing.author,
          description: null,
          genreSlugs: ["ficcao-cientifica"],
          rating: 5.0,
        },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => updated),
            },
            genre: {
              findMany: mock(async () => [
                { slug: "ficcao-cientifica", name: "Ficção Científica" },
              ]),
            },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(saveEmbeddingMock).not.toHaveBeenCalled();
    });

    it("regenerates and saves embedding when only title changes", async () => {
      const existing = makeBook();
      const updated = makeBook({ title: "Messias de Duna" });
      const vector = [0.25, 0.75];
      const genEmbeddingMock = mock(async () => vector);
      const saveEmbeddingMock = mock(async () => undefined);

      const result = await updateBook(
        existing.id,
        { title: "Messias de Duna" },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => updated),
            },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(result).toEqual(updated);
      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).toContain("Título: Messias de Duna");
      expect(saveEmbeddingMock).toHaveBeenCalledWith(existing.id, vector);
    });

    it("regenerates and saves embedding when only author changes", async () => {
      const existing = makeBook();
      const vector = [0.3, 0.7];
      const genEmbeddingMock = mock(async () => vector);
      const saveEmbeddingMock = mock(async () => undefined);

      await updateBook(
        existing.id,
        { author: "F. Herbert" },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => existing),
            },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).toContain("Autor: F. Herbert");
      expect(saveEmbeddingMock).toHaveBeenCalledWith(existing.id, vector);
    });

    it("regenerates and saves embedding when only description changes to null", async () => {
      const existing = makeBook({ description: "Descrição original" });
      const vector = [0.4, 0.6];
      const genEmbeddingMock = mock(async () => vector);
      const saveEmbeddingMock = mock(async () => undefined);

      await updateBook(
        existing.id,
        { description: null },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => makeBook({ description: null })),
            },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).toContain("Descrição: ");
      expect(saveEmbeddingMock).toHaveBeenCalledWith(existing.id, vector);
    });

    it("regenerates embedding when only genreSlugs changes to another slug of same count and deduplicates duplicates", async () => {
      const existing = makeBook(); // has ["ficcao-cientifica"]
      const findGenresMock = mock(async () => [
        { slug: "aventura", name: "Aventura" },
      ]);
      const updateMock = mock(async () => existing);
      const genEmbeddingMock = mock(async () => [0.5, 0.5]);
      const saveEmbeddingMock = mock(async () => undefined);

      await updateBook(
        existing.id,
        { genreSlugs: ["aventura", "aventura"] },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: updateMock,
            },
            genre: { findMany: findGenresMock },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(findGenresMock).toHaveBeenCalledWith({
        where: { slug: { in: ["aventura"] } },
      });

      const updateArgs = (updateMock.mock.calls[0] as unknown[])[0] as {
        data: { genres: { set: { slug: string }[] } };
      };
      expect(updateArgs.data.genres.set).toEqual([{ slug: "aventura" }]);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).toContain("Gêneros: Aventura");
      expect(saveEmbeddingMock).toHaveBeenCalledTimes(1);
    });

    it("regenerates embedding when genreSlugs is cleared to empty array", async () => {
      const existing = makeBook();
      const findGenresMock = mock(async () => []);
      const genEmbeddingMock = mock(async () => [0.6, 0.4]);
      const saveEmbeddingMock = mock(async () => undefined);

      await updateBook(
        existing.id,
        { genreSlugs: [] },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => makeBook({ genres: [] })),
            },
            genre: { findMany: findGenresMock },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(findGenresMock).not.toHaveBeenCalled();
      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).not.toContain("Gêneros:");
      expect(saveEmbeddingMock).toHaveBeenCalledTimes(1);
    });

    it("preserves this binding when calling deps.prisma.$executeRaw", async () => {
      const existing = makeBook();
      let receivedContextTag: string | undefined;

      const fakePrisma = {
        contextTag: "bound-prisma",
        book: {
          findUnique: mock(async () => existing),
          update: mock(async () => existing),
        },
        genre: { findMany: mock(async () => []) },
        async $executeRaw(
          this: { contextTag?: string },
          _query: TemplateStringsArray,
          ..._values: unknown[]
        ) {
          receivedContextTag = this?.contextTag;
          return 1;
        },
      };

      await updateBook(
        existing.id,
        { title: "Filhos de Duna" },
        {
          prisma: fakePrisma,
          generateEmbedding: mock(async () => [0.1, 0.9]),
        },
      );

      expect(receivedContextTag).toBe("bound-prisma");
    });

    it("propagates errors from generateEmbedding without updating or saving embedding", async () => {
      const existing = makeBook();
      const updateMock = mock(async () => existing);
      const saveEmbeddingMock = mock(async () => undefined);
      const genEmbeddingMock = mock(async () => {
        throw new Error("OpenAI embedding failure");
      });

      await expect(
        updateBook(
          existing.id,
          { title: "Título Alterado" },
          {
            prisma: {
              book: {
                findUnique: mock(async () => existing),
                update: updateMock,
              },
              genre: { findMany: mock(async () => []) },
            },
            generateEmbedding: genEmbeddingMock,
            saveBookEmbedding: saveEmbeddingMock,
          },
        ),
      ).rejects.toThrow("OpenAI embedding failure");

      expect(updateMock).not.toHaveBeenCalled();
      expect(saveEmbeddingMock).not.toHaveBeenCalled();
    });

    it("propagates errors from saveBookEmbedding", async () => {
      const existing = makeBook();
      const saveEmbeddingMock = mock(async () => {
        throw new Error("Database vector write failure");
      });

      await expect(
        updateBook(
          existing.id,
          { description: "Sinopse atualizada" },
          {
            prisma: {
              book: {
                findUnique: mock(async () => existing),
                update: mock(async () => existing),
              },
              genre: { findMany: mock(async () => []) },
            },
            generateEmbedding: mock(async () => [0.1, 0.2]),
            saveBookEmbedding: saveEmbeddingMock,
          },
        ),
      ).rejects.toThrow("Database vector write failure");
    });

    it("generates embedding before $transaction and executes tx.book.update + tx.$executeRaw atomically on semantic change", async () => {
      const existing = makeBook();
      const updated = makeBook({ title: "Hereges de Duna" });
      const callOrder: string[] = [];
      let rawContextTag: string | undefined;

      const findUniqueMock = mock(async () => {
        callOrder.push("book.findUnique");
        return existing;
      });
      const findGenresMock = mock(async () => {
        callOrder.push("genre.findMany");
        return [{ slug: "aventura", name: "Aventura" }];
      });
      const genEmbeddingMock = mock(async () => {
        callOrder.push("generateEmbedding");
        return [0.42, 0.58];
      });
      const txUpdateMock = mock(async () => {
        callOrder.push("tx.book.update");
        return updated;
      });

      const fakeTx: UpdateBookTx & { contextTag: string } = {
        contextTag: "update-tx-bound",
        book: { update: txUpdateMock },
        async $executeRaw(this: { contextTag?: string }) {
          callOrder.push("tx.$executeRaw");
          rawContextTag = this?.contextTag;
          return 1;
        },
      };

      const { $transaction } = createTxSpy<UpdateBookTx>(async (fn) => {
        callOrder.push("$transaction:start");
        const res = await fn(fakeTx);
        callOrder.push("$transaction:end");
        return res;
      });

      const result = await updateBook(
        existing.id,
        { title: "Hereges de Duna", genreSlugs: ["aventura", "aventura"] },
        {
          prisma: {
            book: {
              findUnique: findUniqueMock,
              update: mock(async () => {
                throw new Error("Should not call outer prisma.book.update");
              }),
            },
            genre: { findMany: findGenresMock },
            $transaction,
          },
          generateEmbedding: genEmbeddingMock,
        },
      );

      expect(result).toEqual(updated);
      expect(rawContextTag).toBe("update-tx-bound");
      expect(callOrder).toEqual([
        "book.findUnique",
        "genre.findMany",
        "generateEmbedding",
        "$transaction:start",
        "tx.book.update",
        "tx.$executeRaw",
        "$transaction:end",
      ]);
    });

    it("rolls back $transaction on semantic update when vector write fails after tx.book.update", async () => {
      const existing = makeBook({ title: "Título Original" });
      let persistedTitle = existing.title;
      let rolledBack = false;

      const { $transaction } = createTxSpy<UpdateBookTx>(async (fn) => {
        let stagedTitle = persistedTitle;
        const tx: UpdateBookTx = {
          book: {
            update: mock(async () => {
              stagedTitle = "Título Não Commitado";
              return makeBook({ title: stagedTitle });
            }),
          },
          $executeRaw: mock(async () => {
            throw new Error("Vector update failed");
          }),
        };

        try {
          const res = await fn(tx);
          persistedTitle = stagedTitle;
          return res;
        } catch (err) {
          rolledBack = true;
          throw err;
        }
      });

      await expect(
        updateBook(
          existing.id,
          { title: "Título Não Commitado" },
          {
            prisma: {
              book: {
                findUnique: mock(async () => existing),
                update: mock(async () => existing),
              },
              genre: { findMany: mock(async () => []) },
              $transaction,
            },
            generateEmbedding: mock(async () => [0.2, 0.8]),
          },
        ),
      ).rejects.toThrow("Vector update failed");

      expect(rolledBack).toBe(true);
      expect(persistedTitle).toBe("Título Original");
    });

    it("aborts updateBook before generateEmbedding and $transaction when genreSlugs contains missing slug", async () => {
      const existing = makeBook();
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const { spy: transactionMock, $transaction } = createTxSpy<UpdateBookTx>(
        async (fn) => fn({ book: { update: mock(async () => existing) } }),
      );

      await expect(
        updateBook(
          existing.id,
          { genreSlugs: ["nao-existe"] },
          {
            prisma: {
              book: {
                findUnique: mock(async () => existing),
                update: mock(async () => existing),
              },
              genre: { findMany: mock(async () => []) },
              $transaction,
            },
            generateEmbedding: genEmbeddingMock,
          },
        ),
      ).rejects.toThrow("Genre(s) not found: nao-existe");

      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("updates metadata inside $transaction without embedding on non-semantic change", async () => {
      const existing = makeBook({ rating: 4.0 });
      const updated = makeBook({ rating: 5.0 });
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const executeRawMock = mock(async () => 1);
      const txUpdateMock = mock(async () => updated);

      const { spy: transactionMock, $transaction } = createTxSpy<UpdateBookTx>(
        async (fn) =>
          fn({
            book: { update: txUpdateMock },
            $executeRaw: executeRawMock,
          }),
      );

      const result = await updateBook(
        existing.id,
        { rating: 5.0 },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => existing),
            },
            genre: { findMany: mock(async () => []) },
            $transaction,
          },
          generateEmbedding: genEmbeddingMock,
        },
      );

      expect(result).toEqual(updated);
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(txUpdateMock).toHaveBeenCalledTimes(1);
      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(executeRawMock).not.toHaveBeenCalled();
    });
  });

  describe("findSimilarBooks", () => {
    it("isolates vector top-K search inside WITH top_books CTE before joining genres", async () => {
      const expected = [makeSimilarBook()];
      let capturedSql = "";
      let capturedValues: unknown[] = [];

      const queryRawMock = mock(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          capturedSql = strings.join("?");
          capturedValues = values;
          return expected;
        },
      );

      const result = await findSimilarBooks([0.1, 0.2, 0.3], 7, {
        prisma: {
          $queryRaw: <T = unknown>(
            query: TemplateStringsArray,
            ...values: unknown[]
          ) => queryRawMock(query, ...values) as Promise<T>,
        },
      });

      expect(result).toEqual(expected);
      expect(queryRawMock).toHaveBeenCalledTimes(1);

      const cteIndex = capturedSql.indexOf("WITH top_books AS");
      const joinIndex = capturedSql.indexOf('LEFT JOIN "_BookToGenre"');
      const orderDescIndex = capturedSql.indexOf('ORDER BY tb."similarity" DESC');

      expect(cteIndex).toBeGreaterThanOrEqual(0);
      expect(joinIndex).toBeGreaterThan(cteIndex);
      expect(capturedSql.slice(cteIndex, joinIndex)).toContain(
        'WHERE b."embedding" IS NOT NULL',
      );
      expect(capturedSql.slice(cteIndex, joinIndex)).toContain(
        'ORDER BY b."embedding" <=>',
      );
      expect(capturedSql.slice(cteIndex, joinIndex)).toContain("LIMIT ?");
      expect(orderDescIndex).toBeGreaterThan(joinIndex);
      expect(capturedValues).toContain("[0.1,0.2,0.3]");
      expect(capturedValues).toContain(7);
    });
  });

  describe("searchSimilarBooks", () => {
    it("filters results post-query using default minSimilarity threshold of 0.25", async () => {
      const highMatch = makeSimilarBook({ id: "b1", similarity: 0.82 });
      const boundaryMatch = makeSimilarBook({ id: "b2", similarity: 0.25 });
      const lowMatch = makeSimilarBook({ id: "b3", similarity: 0.249 });

      const findSimilarMock = mock(async () => [
        highMatch,
        boundaryMatch,
        lowMatch,
      ]);
      const genEmbeddingMock = mock(async () => [0.5, 0.5]);

      const results = await searchSimilarBooks("solidão no espaço", 5, undefined, {
        generateEmbedding: genEmbeddingMock,
        findSimilarBooks: findSimilarMock,
      });

      expect(genEmbeddingMock).toHaveBeenCalledWith("solidão no espaço");
      expect(findSimilarMock).toHaveBeenCalledWith([0.5, 0.5], 5);
      expect(results).toEqual([highMatch, boundaryMatch]);
    });

    it("supports custom minSimilarity threshold and returns empty array when nothing meets it", async () => {
      const lowMatch = makeSimilarBook({ id: "b1", similarity: 0.4 });
      const findSimilarMock = mock(async () => [lowMatch]);

      const results = await searchSimilarBooks("tema distante", 3, 0.6, {
        generateEmbedding: mock(async () => [0.1, 0.2]),
        findSimilarBooks: findSimilarMock,
      });

      expect(findSimilarMock).toHaveBeenCalledWith([0.1, 0.2], 3);
      expect(results).toEqual([]);
    });

    it("throws RangeError for invalid minSimilarity values (NaN, < 0, > 1)", async () => {
      const genEmbeddingMock = mock(async () => [0.1]);

      await expect(
        searchSimilarBooks("espaço", 5, Number.NaN, {
          generateEmbedding: genEmbeddingMock,
        }),
      ).rejects.toThrow(RangeError);

      await expect(
        searchSimilarBooks("espaço", 5, -0.1, {
          generateEmbedding: genEmbeddingMock,
        }),
      ).rejects.toThrow(RangeError);

      await expect(
        searchSimilarBooks("espaço", 5, 1.05, {
          generateEmbedding: genEmbeddingMock,
        }),
      ).rejects.toThrow(RangeError);

      expect(genEmbeddingMock).not.toHaveBeenCalled();
    });
  });

  describe("getCatalogStats", () => {
    it("computes real catalog aggregations via PostgreSQL aggregate and genre counts without loading books", async () => {
      const oldest = new Date("1949-06-08T00:00:00.000Z");
      const newest = new Date("2024-03-15T00:00:00.000Z");

      const aggregateMock = mock(async () => ({
        _count: { _all: 42 },
        _avg: { rating: 4.65 },
        _min: { publishedAt: oldest },
        _max: { publishedAt: newest },
      }));
      const genreFindManyMock = mock(async () => [
        { slug: "ficcao-cientifica", name: "Ficção Científica", _count: { books: 18 } },
        { slug: "fantasia", name: "Fantasia", _count: { books: 12 } },
      ]);

      const stats = await getCatalogStats({
        prisma: {
          book: { aggregate: aggregateMock },
          genre: { findMany: genreFindManyMock },
        },
      });

      expect(aggregateMock).toHaveBeenCalledWith({
        _count: { _all: true },
        _avg: { rating: true },
        _min: { publishedAt: true },
        _max: { publishedAt: true },
      });
      expect(genreFindManyMock).toHaveBeenCalledWith({
        select: {
          slug: true,
          name: true,
          _count: { select: { books: true } },
        },
        orderBy: [{ books: { _count: "desc" } }, { name: "asc" }],
      });
      expect(stats).toEqual({
        totalBooks: 42,
        averageRating: 4.65,
        booksByGenre: [
          { slug: "ficcao-cientifica", name: "Ficção Científica", count: 18 },
          { slug: "fantasia", name: "Fantasia", count: 12 },
        ],
        oldestPublishedAt: oldest,
        newestPublishedAt: newest,
      });
    });

    it("handles empty catalog gracefully while preserving zero-count genres", async () => {
      const stats = await getCatalogStats({
        prisma: {
          book: {
            aggregate: mock(async () => ({
              _count: { _all: 0 },
              _avg: { rating: null },
              _min: { publishedAt: null },
              _max: { publishedAt: null },
            })),
          },
          genre: {
            findMany: mock(async () => [
              { slug: "ficcao", name: "Ficção", _count: { books: 0 } },
            ]),
          },
        },
      });

      expect(stats).toEqual({
        totalBooks: 0,
        averageRating: null,
        booksByGenre: [{ slug: "ficcao", name: "Ficção", count: 0 }],
        oldestPublishedAt: null,
        newestPublishedAt: null,
      });
    });

    it("preserves averageRating of 0, handles empty genres list, and converts ISO string _min/_max dates", async () => {
      const stats = await getCatalogStats({
        prisma: {
          book: {
            aggregate: mock(async () => ({
              _count: { _all: 2 },
              _avg: { rating: 0 },
              _min: { publishedAt: "1984-01-01T00:00:00.000Z" },
              _max: { publishedAt: "2020-05-10T00:00:00.000Z" },
            })),
          },
          genre: {
            findMany: mock(async () => []),
          },
        },
      });

      expect(stats).toEqual({
        totalBooks: 2,
        averageRating: 0,
        booksByGenre: [],
        oldestPublishedAt: new Date("1984-01-01T00:00:00.000Z"),
        newestPublishedAt: new Date("2020-05-10T00:00:00.000Z"),
      });
    });
  });

  describe("findSimilarBooksByBookId", () => {
    it("reuses persisted pgvector embedding via O(1) lookup + HNSW top-K CTE excluding own bookId and applies minSimilarity post-CTE", async () => {
      const capturedQueries: {
        sql: string;
        values: unknown[];
        contextTag?: string;
      }[] = [];

      const highMatch = makeSimilarBook({ id: "book-2", similarity: 0.84 });
      const boundaryMatch = makeSimilarBook({ id: "book-3", similarity: 0.25 });
      const belowThreshold = makeSimilarBook({ id: "book-4", similarity: 0.24 });

      const fakePrisma = {
        contextTag: "similar-by-id",
        async $queryRaw<T = unknown>(
          this: { contextTag?: string },
          strings: TemplateStringsArray,
          ...values: unknown[]
        ): Promise<T> {
          const sql = strings.join("?");
          capturedQueries.push({
            sql,
            values,
            contextTag: this?.contextTag,
          });

          if (capturedQueries.length === 1) {
            return [
              {
                id: "book-1",
                title: "Duna",
                author: "Frank Herbert",
                embeddingText: "[0.1,0.2,0.3]",
              },
            ] as T;
          }

          return [highMatch, boundaryMatch, belowThreshold] as T;
        },
      };

      const result = await findSimilarBooksByBookId("book-1", 3, undefined, {
        prisma: fakePrisma,
      });

      expect(capturedQueries).toHaveLength(2);
      expect(capturedQueries[0]?.contextTag).toBe("similar-by-id");
      expect(capturedQueries[1]?.contextTag).toBe("similar-by-id");

      expect(capturedQueries[0]?.sql).toContain('"embedding"::text AS "embeddingText"');
      expect(capturedQueries[0]?.values).toEqual(["book-1"]);

      const vectorSql = capturedQueries[1]!.sql;
      const cteIndex = vectorSql.indexOf("WITH top_books AS");
      const joinIndex = vectorSql.indexOf('LEFT JOIN "_BookToGenre"');
      expect(cteIndex).toBeGreaterThanOrEqual(0);
      expect(joinIndex).toBeGreaterThan(cteIndex);
      expect(vectorSql.slice(cteIndex, joinIndex)).toContain(
        'WHERE b."embedding" IS NOT NULL',
      );
      expect(vectorSql.slice(cteIndex, joinIndex)).toContain('b."id" <> ?');
      expect(vectorSql.slice(cteIndex, joinIndex)).toContain(
        'ORDER BY b."embedding" <=> ?::vector',
      );
      expect(vectorSql.slice(cteIndex, joinIndex)).toContain("LIMIT ?");
      expect(vectorSql.slice(joinIndex)).toContain(
        'ORDER BY tb."similarity" DESC, tb."createdAt" DESC, tb."id" ASC',
      );
      expect(capturedQueries[1]?.values).toEqual([
        "[0.1,0.2,0.3]",
        "book-1",
        "[0.1,0.2,0.3]",
        3,
      ]);

      expect(result).toEqual({
        status: "ok",
        sourceBook: { id: "book-1", title: "Duna", author: "Frank Herbert" },
        books: [highMatch, boundaryMatch],
      });
    });

    it("hydrates raw similar rows safely (null rating, string dates, malformed/non-array genres) and returns empty books when all are below minSimilarity", async () => {
      let callCount = 0;
      const queryRawMock = mock(
        async (_query: TemplateStringsArray, ..._values: unknown[]) => {
          callCount += 1;
          if (callCount % 2 === 1) {
            return [
              {
                id: "book-src",
                title: "Duna",
                author: "Frank Herbert",
                embeddingText: "[0.1,0.2]",
              },
            ];
          }
          if (callCount === 2) {
            return [
              {
                id: "sim-1",
                title: "Livro Null Rating",
                author: "Autor A",
                description: null,
                coverUrl: null,
                rating: null,
                publishedAt: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                genres: JSON.stringify([{ slug: "ficcao", name: "Ficção" }]),
                similarity: 0.72,
              },
              {
                id: "sim-2",
                title: "Livro Genres Quebrado",
                author: "Autor B",
                description: "Desc",
                coverUrl: null,
                rating: Number.NaN,
                publishedAt: "1999-05-01T00:00:00.000Z",
                createdAt: "2026-02-01T00:00:00.000Z",
                genres: "{bad-json",
                similarity: 0.5,
              },
              {
                id: "sim-3",
                title: "Livro Genres Objeto",
                author: "Autor C",
                description: null,
                coverUrl: null,
                rating: 4.1,
                publishedAt: null,
                createdAt: "2026-03-01T00:00:00.000Z",
                genres: '{"slug":"x"}',
                similarity: 0.3,
              },
              {
                id: "sim-4",
                title: "Livro Genres Null",
                author: "Autor D",
                description: null,
                coverUrl: null,
                rating: 3.5,
                publishedAt: null,
                createdAt: "2026-04-01T00:00:00.000Z",
                genres: null,
                similarity: 0.28,
              },
            ];
          }
          return [
            {
              id: "below-1",
              title: "Distante",
              author: "Autor",
              description: null,
              coverUrl: null,
              rating: 4.0,
              publishedAt: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              genres: [],
              similarity: 0.24,
            },
          ];
        },
      );

      const hydratedRes = await findSimilarBooksByBookId("book-src", 5, 0.25, {
        prisma: {
          $queryRaw: <T = unknown>(
            query: TemplateStringsArray,
            ...values: unknown[]
          ) => queryRawMock(query, ...values) as Promise<T>,
        },
      });

      expect(hydratedRes.status).toBe("ok");
      if (hydratedRes.status === "ok") {
        expect(hydratedRes.books).toHaveLength(4);
        expect(hydratedRes.books[0]?.rating).toBeNull();
        expect(hydratedRes.books[0]?.publishedAt).toBeNull();
        expect(hydratedRes.books[0]?.createdAt).toBeInstanceOf(Date);
        expect(hydratedRes.books[0]?.genres).toEqual([
          { slug: "ficcao", name: "Ficção" },
        ]);
        expect(hydratedRes.books[1]?.rating).toBeNull();
        expect(hydratedRes.books[1]?.publishedAt).toBeInstanceOf(Date);
        expect(hydratedRes.books[1]?.genres).toEqual([]);
        expect(hydratedRes.books[2]?.genres).toEqual([]);
        expect(hydratedRes.books[3]?.genres).toEqual([]);
      }

      const emptyBelowRes = await findSimilarBooksByBookId(
        "book-src",
        5,
        0.25,
        {
          prisma: {
            $queryRaw: <T = unknown>(
              query: TemplateStringsArray,
              ...values: unknown[]
            ) => queryRawMock(query, ...values) as Promise<T>,
          },
        },
      );
      expect(emptyBelowRes).toEqual({
        status: "ok",
        sourceBook: { id: "book-src", title: "Duna", author: "Frank Herbert" },
        books: [],
      });
    });

    it("returns not_found when book does not exist or bookId is blank", async () => {
      const queryRawMock = mock(
        async (_query: TemplateStringsArray, ..._values: unknown[]) => [],
      );

      const blankRes = await findSimilarBooksByBookId("   ", 5, 0.25, {
        prisma: {
          $queryRaw: <T = unknown>(
            query: TemplateStringsArray,
            ...values: unknown[]
          ) => queryRawMock(query, ...values) as Promise<T>,
        },
      });
      expect(blankRes).toEqual({ status: "not_found" });
      expect(queryRawMock).not.toHaveBeenCalled();

      const missingRes = await findSimilarBooksByBookId("missing-id", 5, 0.25, {
        prisma: {
          $queryRaw: <T = unknown>(
            query: TemplateStringsArray,
            ...values: unknown[]
          ) => queryRawMock(query, ...values) as Promise<T>,
        },
      });
      expect(missingRes).toEqual({ status: "not_found" });
      expect(queryRawMock).toHaveBeenCalledTimes(1);
    });

    it("returns no_embedding when book exists with null embedding without executing vector query", async () => {
      const queryRawMock = mock(
        async (_query: TemplateStringsArray, ..._values: unknown[]) => [
          {
            id: "book-no-vec",
            title: "Sem Vetor",
            author: "Autor",
            embeddingText: null,
          },
        ],
      );

      const result = await findSimilarBooksByBookId("book-no-vec", 5, 0.25, {
        prisma: {
          $queryRaw: <T = unknown>(
            query: TemplateStringsArray,
            ...values: unknown[]
          ) => queryRawMock(query, ...values) as Promise<T>,
        },
      });

      expect(result).toEqual({
        status: "no_embedding",
        sourceBook: { id: "book-no-vec", title: "Sem Vetor", author: "Autor" },
      });
      expect(queryRawMock).toHaveBeenCalledTimes(1);
    });

    it("throws RangeError for invalid limit or minSimilarity without querying database", async () => {
      const queryRawMock = mock(
        async (_query: TemplateStringsArray, ..._values: unknown[]) => [],
      );

      for (const badLimit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        await expect(
          findSimilarBooksByBookId("book-1", badLimit, 0.25, {
            prisma: {
              $queryRaw: <T = unknown>(
                query: TemplateStringsArray,
                ...values: unknown[]
              ) => queryRawMock(query, ...values) as Promise<T>,
            },
          }),
        ).rejects.toThrow(RangeError);
      }

      await expect(
        findSimilarBooksByBookId("book-1", 5, 1.5, {
          prisma: {
            $queryRaw: <T = unknown>(
              query: TemplateStringsArray,
              ...values: unknown[]
            ) => queryRawMock(query, ...values) as Promise<T>,
          },
        }),
      ).rejects.toThrow(RangeError);
      expect(queryRawMock).not.toHaveBeenCalled();
    });
  });
});
