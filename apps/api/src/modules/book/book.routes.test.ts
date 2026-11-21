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
import { listBooks, type BookWithGenres } from "./book.service";

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
      expect(spec.paths?.["/api/books/{id}"]?.get?.security).toBeUndefined();

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
