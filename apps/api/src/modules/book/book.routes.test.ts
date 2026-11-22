import fastifySwagger from "@fastify/swagger";
import { describe, expect, it, mock } from "bun:test";
import { fastify } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { app as realApp } from "@/app";
import { env } from "@/config/env";
import { errorHandler } from "@/errors";

import { booksRoutes, type BookRoutesOptions } from "./book.routes";
import {
  DEFAULT_MIN_SIMILARITY,
  findSimilarBooksByBookId,
  listBooks,
  type BookWithGenres,
  type SimilarBook,
} from "./book.service";

const makeBook = (overrides: Partial<BookWithGenres> = {}): BookWithGenres => ({
  id: "book-1",
  title: "Duna",
  author: "Frank Herbert",
  description: "Épico de ficção científica.",
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
  id: "book-2",
  title: "Messias de Duna",
  author: "Frank Herbert",
  description: "Continuação direta de Duna.",
  coverUrl: "https://example.com/messias.jpg",
  rating: 4.5,
  publishedAt: new Date("1969-10-15T00:00:00.000Z"),
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  genres: [
    {
      slug: "ficcao-cientifica",
      name: "Ficção Científica",
    },
  ],
  similarity: 0.88,
  ...overrides,
});

function buildTestApp(options: BookRoutesOptions = {}) {
  const app = fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  app.register(fastifySwagger, {
    openapi: {
      info: { title: "Test API", version: "1.0.0" },
      components: {
        securitySchemes: {
          adminApiKey: {
            type: "apiKey",
            in: "header",
            name: "X-Admin-Key",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  app.register(booksRoutes, {
    prefix: "/api/books",
    ...options,
  });

  return app;
}

describe("book.routes", () => {
  describe("public GET routes", () => {
    it("allows GET /api/books and GET /api/books/:id without X-Admin-Key", async () => {
      const sampleBook = makeBook();
      const listBooksMock = mock(async () => ({
        books: [sampleBook],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      }));
      const findBookByIdMock = mock(async (id: string) =>
        id === sampleBook.id ? sampleBook : null,
      );

      const app = buildTestApp({
        listBooks: listBooksMock,
        findBookById: findBookByIdMock,
      });

      const listRes = await app.inject({
        method: "GET",
        url: "/api/books",
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().data).toHaveLength(1);

      const detailRes = await app.inject({
        method: "GET",
        url: "/api/books/book-1",
      });
      expect(detailRes.statusCode).toBe(200);
      expect(detailRes.json().data.id).toBe("book-1");

      const notFoundRes = await app.inject({
        method: "GET",
        url: "/api/books/missing",
      });
      expect(notFoundRes.statusCode).toBe(404);
      expect(notFoundRes.json()).toEqual({ data: null });

      await app.close();
    });

    it("accepts GET /api/books?sortBy=relevance without 400 and omits sortBy when absent", async () => {
      const capturedQueries: Record<string, unknown>[] = [];
      const listBooksMock = mock(async (query: Record<string, unknown>) => {
        capturedQueries.push(query);
        return {
          books: [makeBook()],
          meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        };
      });

      const app = buildTestApp({
        listBooks: listBooksMock as BookRoutesOptions["listBooks"],
      });

      const relevanceRes = await app.inject({
        method: "GET",
        url: "/api/books?search=duna&sortBy=relevance",
      });
      expect(relevanceRes.statusCode).toBe(200);
      expect(capturedQueries[0]).toMatchObject({
        search: "duna",
        sortBy: "relevance",
      });

      const defaultRes = await app.inject({
        method: "GET",
        url: "/api/books?search=duna",
      });
      expect(defaultRes.statusCode).toBe(200);
      expect(capturedQueries[1]?.search).toBe("duna");
      expect(capturedQueries[1]?.sortBy).toBeUndefined();

      await app.close();
    });

    it("serializes hydrated Date values from FTS listBooks through BookSchema without error", async () => {
      const app = buildTestApp({
        listBooks: (query) =>
          listBooks(query, {
            prisma: {
              $queryRaw: async <T = unknown>(sqlQuery: unknown): Promise<T> => {
                const rawSql = (sqlQuery as { sql: string }).sql;
                if (rawSql.includes("COUNT(*)")) {
                  return [{ total: BigInt(1) }] as T;
                }
                return [
                  {
                    id: "book-fts-1",
                    title: "Duna",
                    author: "Frank Herbert",
                    description: "Arrakis",
                    coverUrl: null,
                    rating: 4.9,
                    publishedAt: null,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-02T00:00:00.000Z",
                    genres: JSON.stringify([
                      {
                        slug: "ficcao-cientifica",
                        name: "Ficção Científica",
                        createdAt: "2026-01-01T00:00:00+00:00",
                        updatedAt: "2026-01-02T00:00:00+00:00",
                      },
                    ]),
                  },
                ] as T;
              },
            },
          }),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/books?search=duna&sortBy=relevance",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data[0]).toMatchObject({
        id: "book-fts-1",
        title: "Duna",
        publishedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        genres: [
          {
            slug: "ficcao-cientifica",
            name: "Ficção Científica",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      });

      await app.close();
    });

    it("forwards valid publishedAfter/publishedBefore filters and returns 400 for invalid dates or inverted intervals", async () => {
      const capturedQueries: Record<string, unknown>[] = [];
      const listBooksMock = mock(async (query: Record<string, unknown>) => {
        capturedQueries.push(query);
        return {
          books: [makeBook()],
          meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        };
      });

      const app = buildTestApp({
        listBooks: listBooksMock as BookRoutesOptions["listBooks"],
      });

      const validRes = await app.inject({
        method: "GET",
        url: "/api/books?publishedAfter=1960-01-01&publishedBefore=1969-12-31",
      });
      expect(validRes.statusCode).toBe(200);
      expect(capturedQueries[0]).toMatchObject({
        publishedAfter: "1960-01-01",
        publishedBefore: "1969-12-31",
      });

      const afterOnlyRes = await app.inject({
        method: "GET",
        url: "/api/books?publishedAfter=1980-01-01",
      });
      expect(afterOnlyRes.statusCode).toBe(200);
      expect(capturedQueries[1]).toMatchObject({
        publishedAfter: "1980-01-01",
      });
      expect(capturedQueries[1]?.publishedBefore).toBeUndefined();

      const beforeOnlyRes = await app.inject({
        method: "GET",
        url: "/api/books?publishedBefore=1999-12-31",
      });
      expect(beforeOnlyRes.statusCode).toBe(200);
      expect(capturedQueries[2]).toMatchObject({
        publishedBefore: "1999-12-31",
      });
      expect(capturedQueries[2]?.publishedAfter).toBeUndefined();

      const isoOffsetRes = await app.inject({
        method: "GET",
        url: "/api/books?publishedAfter=1965-08-01T00:00:00Z&publishedBefore=1965-08-01T12:00:00-03:00",
      });
      expect(isoOffsetRes.statusCode).toBe(200);
      expect(capturedQueries[3]).toMatchObject({
        publishedAfter: "1965-08-01T00:00:00Z",
        publishedBefore: "1965-08-01T12:00:00-03:00",
      });

      const sameDayRes = await app.inject({
        method: "GET",
        url: "/api/books?publishedAfter=2020-02-29&publishedBefore=2020-02-29",
      });
      expect(sameDayRes.statusCode).toBe(200);

      const searchCombinedRes = await app.inject({
        method: "GET",
        url: "/api/books?search=duna&publishedAfter=1960-01-01&publishedBefore=1969-12-31",
      });
      expect(searchCombinedRes.statusCode).toBe(200);
      expect(capturedQueries[5]).toMatchObject({
        search: "duna",
        publishedAfter: "1960-01-01",
        publishedBefore: "1969-12-31",
      });

      const invertedRes = await app.inject({
        method: "GET",
        url: "/api/books?publishedAfter=2020-01-01&publishedBefore=2010-01-01",
      });
      expect(invertedRes.statusCode).toBe(400);

      const rolloverRes = await app.inject({
        method: "GET",
        url: "/api/books?publishedAfter=2020-02-31",
      });
      expect(rolloverRes.statusCode).toBe(400);

      const yearZeroRes = await app.inject({
        method: "GET",
        url: "/api/books?publishedAfter=0000-01-01",
      });
      expect(yearZeroRes.statusCode).toBe(400);

      const invalidTextRes = await app.inject({
        method: "GET",
        url: "/api/books?publishedBefore=abc",
      });
      expect(invalidTextRes.statusCode).toBe(400);

      expect(listBooksMock).toHaveBeenCalledTimes(6);

      await app.close();
    });

    it("allows GET /api/books/:id/similar without X-Admin-Key, normalizes similarity 1-100, and respects default and explicit limit", async () => {
      const findSimilarMock = mock(async () => ({
        status: "ok" as const,
        sourceBook: {
          id: "book-1",
          title: "Duna",
          author: "Frank Herbert",
        },
        books: [
          makeSimilarBook({ id: "sim-min", similarity: 0.001 }),
          makeSimilarBook({ id: "sim-mid", similarity: 0.876 }),
          makeSimilarBook({ id: "sim-threshold", similarity: 0.254 }),
          makeSimilarBook({ id: "sim-max", similarity: 1.2 }),
        ],
      }));

      const app = buildTestApp({
        findSimilarBooksByBookId: findSimilarMock,
      });

      const defaultRes = await app.inject({
        method: "GET",
        url: "/api/books/book-1/similar",
      });
      expect(defaultRes.statusCode).toBe(200);
      expect(findSimilarMock).toHaveBeenCalledWith(
        "book-1",
        4,
        DEFAULT_MIN_SIMILARITY,
      );

      const defaultBody = defaultRes.json();
      expect(defaultBody.data).toHaveLength(4);
      expect(defaultBody.data.map((b: { similarity: number }) => b.similarity)).toEqual([
        1,
        88,
        25,
        100,
      ]);

      const customLimitRes = await app.inject({
        method: "GET",
        url: "/api/books/book-1/similar?limit=7",
      });
      expect(customLimitRes.statusCode).toBe(200);
      expect(findSimilarMock).toHaveBeenCalledWith(
        "book-1",
        7,
        DEFAULT_MIN_SIMILARITY,
      );

      const minLimitRes = await app.inject({
        method: "GET",
        url: "/api/books/book-1/similar?limit=1",
      });
      expect(minLimitRes.statusCode).toBe(200);
      expect(findSimilarMock).toHaveBeenCalledWith(
        "book-1",
        1,
        DEFAULT_MIN_SIMILARITY,
      );

      const maxLimitRes = await app.inject({
        method: "GET",
        url: "/api/books/book-1/similar?limit=10",
      });
      expect(maxLimitRes.statusCode).toBe(200);
      expect(findSimilarMock).toHaveBeenCalledWith(
        "book-1",
        10,
        DEFAULT_MIN_SIMILARITY,
      );

      await app.close();
    });

    it("returns 404 for not_found and 200 [] for no_embedding or empty matches on GET /api/books/:id/similar", async () => {
      const findSimilarMock = mock(async (id: string) => {
        if (id === "missing") {
          return { status: "not_found" as const };
        }
        if (id === "no-embedding") {
          return {
            status: "no_embedding" as const,
            sourceBook: {
              id: "no-embedding",
              title: "Sem Embedding",
              author: "Autor",
            },
          };
        }
        return {
          status: "ok" as const,
          sourceBook: {
            id,
            title: "Isolado",
            author: "Autor",
          },
          books: [],
        };
      });

      const app = buildTestApp({
        findSimilarBooksByBookId: findSimilarMock,
      });

      const notFoundRes = await app.inject({
        method: "GET",
        url: "/api/books/missing/similar",
      });
      expect(notFoundRes.statusCode).toBe(404);
      expect(notFoundRes.json()).toEqual({ data: null });

      const noEmbeddingRes = await app.inject({
        method: "GET",
        url: "/api/books/no-embedding/similar",
      });
      expect(noEmbeddingRes.statusCode).toBe(200);
      expect(noEmbeddingRes.json()).toEqual({ data: [] });

      const emptyRes = await app.inject({
        method: "GET",
        url: "/api/books/isolated/similar",
      });
      expect(emptyRes.statusCode).toBe(200);
      expect(emptyRes.json()).toEqual({ data: [] });

      await app.close();
    });

    it("returns 400 Bad Request for invalid limit values on GET /api/books/:id/similar", async () => {
      const findSimilarMock = mock(async () => ({
        status: "not_found" as const,
      }));
      const app = buildTestApp({
        findSimilarBooksByBookId: findSimilarMock,
      });

      for (const invalidQuery of ["limit=0", "limit=11", "limit=abc", "limit=2.5"]) {
        const res = await app.inject({
          method: "GET",
          url: `/api/books/book-1/similar?${invalidQuery}`,
        });
        expect(res.statusCode).toBe(400);
      }

      expect(findSimilarMock).not.toHaveBeenCalled();

      await app.close();
    });

    it("serializes hydrated rows from findSimilarBooksByBookId through SimilarBookSchema", async () => {
      const app = buildTestApp({
        findSimilarBooksByBookId: (bookId, limit, minSimilarity) =>
          findSimilarBooksByBookId(bookId, limit, minSimilarity, {
            prisma: {
              $queryRaw: async <T = unknown>(sqlQuery: unknown): Promise<T> => {
                const rawSql = Array.isArray(sqlQuery)
                  ? sqlQuery.join("")
                  : ((sqlQuery as { sql?: string }).sql ?? "");
                if (rawSql.includes("embeddingText")) {
                  return [
                    {
                      id: "book-1",
                      title: "Duna",
                      author: "Frank Herbert",
                      embeddingText: "[0.1,0.2,0.3]",
                    },
                  ] as T;
                }
                return [
                  {
                    id: "book-2",
                    title: "Fundação",
                    author: "Isaac Asimov",
                    description: "Império Galáctico.",
                    coverUrl: null,
                    rating: "4.7",
                    publishedAt: "1951-05-01T00:00:00.000Z",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    genres: JSON.stringify([
                      { slug: "ficcao-cientifica", name: "Ficção Científica" },
                    ]),
                    similarity: 0.844,
                  },
                ] as T;
              },
            },
          }),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/books/book-1/similar",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: [
          {
            id: "book-2",
            title: "Fundação",
            author: "Isaac Asimov",
            description: "Império Galáctico.",
            coverUrl: null,
            rating: 4.7,
            publishedAt: "1951-05-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            genres: [{ slug: "ficcao-cientifica", name: "Ficção Científica" }],
            similarity: 84,
          },
        ],
      });

      await app.close();
    });
  });

  describe("admin-protected mutation routes", () => {
    it("returns 401 for POST /api/books when X-Admin-Key is missing or invalid and executes when valid", async () => {
      const createdBook = makeBook();
      const createBookMock = mock(async () => createdBook);
      const app = buildTestApp({ createBook: createBookMock });

      const payload = {
        title: "Duna",
        author: "Frank Herbert",
        genreSlugs: ["ficcao-cientifica"],
      };

      const missingRes = await app.inject({
        method: "POST",
        url: "/api/books",
        payload,
      });
      expect(missingRes.statusCode).toBe(401);
      expect(missingRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const invalidRes = await app.inject({
        method: "POST",
        url: "/api/books",
        headers: { "x-admin-key": "wrong-key" },
        payload,
      });
      expect(invalidRes.statusCode).toBe(401);
      expect(invalidRes.json()).toEqual({ message: "Invalid Admin API Key" });
      expect(createBookMock).not.toHaveBeenCalled();

      const validRes = await app.inject({
        method: "POST",
        url: "/api/books",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
        payload,
      });
      expect(validRes.statusCode).toBe(201);
      expect(validRes.json().data.id).toBe(createdBook.id);
      expect(createBookMock).toHaveBeenCalledTimes(1);

      await app.close();
    });

    it("returns 401 before body parsing/validation when POST /api/books has invalid body or malformed JSON without X-Admin-Key", async () => {
      const createBookMock = mock(async () => makeBook());
      const app = buildTestApp({ createBook: createBookMock });

      const invalidBodyRes = await app.inject({
        method: "POST",
        url: "/api/books",
        payload: {},
      });
      expect(invalidBodyRes.statusCode).toBe(401);
      expect(invalidBodyRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const malformedJsonRes = await app.inject({
        method: "POST",
        url: "/api/books",
        headers: { "content-type": "application/json" },
        payload: "{invalid-json",
      });
      expect(malformedJsonRes.statusCode).toBe(401);
      expect(malformedJsonRes.json()).toEqual({
        message: "Invalid Admin API Key",
      });

      expect(createBookMock).not.toHaveBeenCalled();

      await app.close();
    });

    it("returns 401 for PUT /api/books/:id when X-Admin-Key is missing or invalid and executes when valid", async () => {
      const updatedBook = makeBook({ title: "Messias de Duna" });
      const updateBookMock = mock(async (id: string) =>
        id === "book-1" ? updatedBook : null,
      );
      const app = buildTestApp({ updateBook: updateBookMock });

      const missingRes = await app.inject({
        method: "PUT",
        url: "/api/books/book-1",
        payload: { title: "Messias de Duna" },
      });
      expect(missingRes.statusCode).toBe(401);
      expect(missingRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const emptyRes = await app.inject({
        method: "PUT",
        url: "/api/books/book-1",
        headers: { "x-admin-key": "" },
        payload: { title: "Messias de Duna" },
      });
      expect(emptyRes.statusCode).toBe(401);
      expect(updateBookMock).not.toHaveBeenCalled();

      const validRes = await app.inject({
        method: "PUT",
        url: "/api/books/book-1",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
        payload: { title: "Messias de Duna" },
      });
      expect(validRes.statusCode).toBe(200);
      expect(validRes.json().data.title).toBe("Messias de Duna");

      const notFoundRes = await app.inject({
        method: "PUT",
        url: "/api/books/unknown",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
        payload: { title: "Messias de Duna" },
      });
      expect(notFoundRes.statusCode).toBe(404);
      expect(notFoundRes.json()).toEqual({ data: null });

      await app.close();
    });

    it("returns 401 for DELETE /api/books/:id when X-Admin-Key is missing or invalid and executes when valid", async () => {
      const deleteBookMock = mock(async (id: string) => id === "book-1");
      const app = buildTestApp({ deleteBook: deleteBookMock });

      const missingRes = await app.inject({
        method: "DELETE",
        url: "/api/books/book-1",
      });
      expect(missingRes.statusCode).toBe(401);
      expect(missingRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const invalidRes = await app.inject({
        method: "DELETE",
        url: "/api/books/book-1",
        headers: { "x-admin-key": "invalid-longer-key-123" },
      });
      expect(invalidRes.statusCode).toBe(401);
      expect(deleteBookMock).not.toHaveBeenCalled();

      const validRes = await app.inject({
        method: "DELETE",
        url: "/api/books/book-1",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
      });
      expect(validRes.statusCode).toBe(200);
      expect(validRes.json()).toEqual({
        message: 'Book "book-1" deleted successfully.',
      });

      const notFoundRes = await app.inject({
        method: "DELETE",
        url: "/api/books/missing",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
      });
      expect(notFoundRes.statusCode).toBe(404);
      expect(notFoundRes.json()).toEqual({ data: null });

      await app.close();
    });

    it("returns 401 for POST /api/books/reindex when X-Admin-Key is missing or invalid and executes when valid", async () => {
      const reindexBooksMock = mock(async () => 4);
      const app = buildTestApp({ reindexBooks: reindexBooksMock });

      const missingRes = await app.inject({
        method: "POST",
        url: "/api/books/reindex",
        payload: { mode: "missing" },
      });
      expect(missingRes.statusCode).toBe(401);
      expect(missingRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const invalidRes = await app.inject({
        method: "POST",
        url: "/api/books/reindex",
        headers: { "x-admin-key": "wrong" },
        payload: { mode: "all" },
      });
      expect(invalidRes.statusCode).toBe(401);
      expect(reindexBooksMock).not.toHaveBeenCalled();

      const validRes = await app.inject({
        method: "POST",
        url: "/api/books/reindex",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
        payload: { mode: "all" },
      });
      expect(validRes.statusCode).toBe(200);
      expect(validRes.json()).toEqual({
        data: { mode: "all", reindexed: 4 },
      });
      expect(reindexBooksMock).toHaveBeenCalledWith("all");

      await app.close();
    });
  });

  describe("OpenAPI Swagger security configuration", () => {
    it("exposes adminApiKey security scheme and marks only protected routes in real app OpenAPI spec", async () => {
      await realApp.ready();
      const spec = realApp.swagger() as {
        components?: {
          securitySchemes?: Record<string, unknown>;
        };
        paths?: Record<
          string,
          Record<
            string,
            {
              parameters?: {
                name: string;
                in: string;
                schema?: { enum?: string[] };
              }[];
              security?: unknown[];
              responses?: Record<string, unknown>;
            }
          >
        >;
      };

      expect(spec.components?.securitySchemes?.adminApiKey).toMatchObject({
        type: "apiKey",
        in: "header",
        name: "X-Admin-Key",
      });
      expect(spec.components?.securitySchemes?.bearerAuth).toMatchObject({
        type: "http",
        scheme: "bearer",
      });

      expect(spec.paths?.["/api/books"]?.get?.security).toBeUndefined();
      const sortByParam = spec.paths?.["/api/books"]?.get?.parameters?.find(
        (param) => param.name === "sortBy" && param.in === "query",
      );
      expect(sortByParam?.schema?.enum).toContain("relevance");
      const queryParamNames = spec.paths?.["/api/books"]?.get?.parameters
        ?.filter((param) => param.in === "query")
        .map((param) => param.name);
      expect(queryParamNames).toContain("publishedAfter");
      expect(queryParamNames).toContain("publishedBefore");
      expect(spec.paths?.["/api/books/{id}"]?.get?.security).toBeUndefined();
      expect(
        spec.paths?.["/api/books/{id}/similar"]?.get?.security,
      ).toBeUndefined();
      expect(
        spec.paths?.["/api/books/{id}/similar"]?.get?.responses?.["200"],
      ).toBeDefined();
      expect(
        spec.paths?.["/api/books/{id}/similar"]?.get?.responses?.["404"],
      ).toBeDefined();
      expect(
        spec.paths?.["/api/books/{id}/similar"]?.get?.responses?.["401"],
      ).toBeUndefined();
      const similarLimitParam = spec.paths?.[
        "/api/books/{id}/similar"
      ]?.get?.parameters?.find(
        (param) => param.name === "limit" && param.in === "query",
      );
      expect(similarLimitParam).toBeDefined();

      expect(spec.paths?.["/api/books"]?.post?.security).toEqual([
        { adminApiKey: [] },
      ]);
      expect(spec.paths?.["/api/books"]?.post?.responses?.["401"]).toBeDefined();

      expect(spec.paths?.["/api/books/{id}"]?.put?.security).toEqual([
        { adminApiKey: [] },
      ]);
      expect(
        spec.paths?.["/api/books/{id}"]?.put?.responses?.["401"],
      ).toBeDefined();

      expect(spec.paths?.["/api/books/{id}"]?.delete?.security).toEqual([
        { adminApiKey: [] },
      ]);
      expect(
        spec.paths?.["/api/books/{id}"]?.delete?.responses?.["401"],
      ).toBeDefined();

      expect(spec.paths?.["/api/books/reindex"]?.post?.security).toEqual([
        { adminApiKey: [] },
      ]);
      expect(
        spec.paths?.["/api/books/reindex"]?.post?.responses?.["401"],
      ).toBeDefined();

      expect(spec.paths?.["/api/genres"]?.get?.security).toBeUndefined();
      expect(spec.paths?.["/api/genres/{slug}"]?.get?.security).toBeUndefined();

      expect(spec.paths?.["/api/genres"]?.post?.security).toEqual([
        { adminApiKey: [] },
      ]);
      expect(
        spec.paths?.["/api/genres"]?.post?.responses?.["401"],
      ).toBeDefined();

      expect(spec.paths?.["/api/genres/{slug}"]?.put?.security).toEqual([
        { adminApiKey: [] },
      ]);
      expect(
        spec.paths?.["/api/genres/{slug}"]?.put?.responses?.["401"],
      ).toBeDefined();

      expect(spec.paths?.["/api/genres/{slug}"]?.delete?.security).toEqual([
        { adminApiKey: [] },
      ]);
      expect(
        spec.paths?.["/api/genres/{slug}"]?.delete?.responses?.["401"],
      ).toBeDefined();

      expect(spec.paths?.["/api/chat"]?.post?.security).toEqual([
        { bearerAuth: [] },
      ]);
      expect(spec.paths?.["/api/chat/stream"]?.post?.security).toEqual([
        { bearerAuth: [] },
      ]);
    });
  });
});
