import { describe, expect, it, mock } from "bun:test";
import { fastify } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { env } from "@/config/env";
import { errorHandler } from "@/errors";

import {
  genresRoutes,
  type GenreRecord,
  type GenreRoutesOptions,
} from "./genre.routes";

const makeGenre = (overrides: Partial<GenreRecord> = {}): GenreRecord => ({
  slug: "terror",
  name: "Terror",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

function buildTestApp(options: GenreRoutesOptions = {}) {
  const app = fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  app.register(genresRoutes, {
    prefix: "/api/genres",
    ...options,
  });

  return app;
}

describe("genre.routes", () => {
  const createPrismaMock = (genreRecord: GenreRecord | null = makeGenre()) => ({
    genre: {
      findMany: mock(async () => (genreRecord ? [genreRecord] : [])),
      findUnique: mock(async ({ where: { slug } }: { where: { slug: string } }) =>
        genreRecord && genreRecord.slug === slug ? genreRecord : null,
      ),
      create: mock(async ({ data }: { data: { slug: string; name: string } }) =>
        makeGenre({ slug: data.slug, name: data.name }),
      ),
      update: mock(
        async ({
          where: { slug },
          data: { name },
        }: {
          where: { slug: string };
          data: { name: string };
        }) => makeGenre({ slug, name }),
      ),
      delete: mock(async ({ where: { slug } }: { where: { slug: string } }) =>
        makeGenre({ slug }),
      ),
    },
  });

  describe("public GET routes", () => {
    it("allows GET /api/genres and GET /api/genres/:slug without X-Admin-Key", async () => {
      const prismaMock = createPrismaMock();
      const app = buildTestApp({ prisma: prismaMock });

      const listRes = await app.inject({
        method: "GET",
        url: "/api/genres",
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().data).toHaveLength(1);

      const detailRes = await app.inject({
        method: "GET",
        url: "/api/genres/terror",
      });
      expect(detailRes.statusCode).toBe(200);
      expect(detailRes.json().data.slug).toBe("terror");

      const notFoundRes = await app.inject({
        method: "GET",
        url: "/api/genres/missing",
      });
      expect(notFoundRes.statusCode).toBe(404);
      expect(notFoundRes.json()).toEqual({ data: null });

      await app.close();
    });
  });

  describe("admin-protected mutation routes", () => {
    it("returns 401 for POST /api/genres without valid X-Admin-Key and creates genre when valid", async () => {
      const prismaMock = createPrismaMock(null);
      const app = buildTestApp({ prisma: prismaMock });

      const missingRes = await app.inject({
        method: "POST",
        url: "/api/genres",
        payload: { slug: "terror", name: "Terror" },
      });
      expect(missingRes.statusCode).toBe(401);
      expect(missingRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const invalidRes = await app.inject({
        method: "POST",
        url: "/api/genres",
        headers: { "x-admin-key": "invalid" },
        payload: { slug: "terror", name: "Terror" },
      });
      expect(invalidRes.statusCode).toBe(401);
      expect(prismaMock.genre.create).not.toHaveBeenCalled();

      const validRes = await app.inject({
        method: "POST",
        url: "/api/genres",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
        payload: { slug: "terror", name: "Terror" },
      });
      expect(validRes.statusCode).toBe(201);
      expect(validRes.json().data.slug).toBe("terror");
      expect(prismaMock.genre.create).toHaveBeenCalledTimes(1);

      await app.close();
    });

    it("returns 401 before body parsing/validation when POST /api/genres has invalid body or malformed JSON without X-Admin-Key", async () => {
      const prismaMock = createPrismaMock(null);
      const app = buildTestApp({ prisma: prismaMock });

      const invalidBodyRes = await app.inject({
        method: "POST",
        url: "/api/genres",
        payload: {},
      });
      expect(invalidBodyRes.statusCode).toBe(401);
      expect(invalidBodyRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const malformedJsonRes = await app.inject({
        method: "POST",
        url: "/api/genres",
        headers: { "content-type": "application/json" },
        payload: "{invalid-json",
      });
      expect(malformedJsonRes.statusCode).toBe(401);
      expect(malformedJsonRes.json()).toEqual({
        message: "Invalid Admin API Key",
      });

      expect(prismaMock.genre.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.genre.create).not.toHaveBeenCalled();

      await app.close();
    });

    it("returns 409 for POST /api/genres when slug already exists", async () => {
      const prismaMock = createPrismaMock(makeGenre());
      const app = buildTestApp({ prisma: prismaMock });

      const conflictRes = await app.inject({
        method: "POST",
        url: "/api/genres",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
        payload: { slug: "terror", name: "Terror" },
      });

      expect(conflictRes.statusCode).toBe(409);
      expect(conflictRes.json()).toEqual({
        message: 'Genre with slug "terror" already exists.',
      });
      expect(prismaMock.genre.create).not.toHaveBeenCalled();

      await app.close();
    });

    it("returns 401 for PUT /api/genres/:slug without valid X-Admin-Key and updates when valid", async () => {
      const prismaMock = createPrismaMock(makeGenre());
      const app = buildTestApp({ prisma: prismaMock });

      const missingRes = await app.inject({
        method: "PUT",
        url: "/api/genres/terror",
        payload: { name: "Horror" },
      });
      expect(missingRes.statusCode).toBe(401);
      expect(missingRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const invalidRes = await app.inject({
        method: "PUT",
        url: "/api/genres/terror",
        headers: { "x-admin-key": "" },
        payload: { name: "Horror" },
      });
      expect(invalidRes.statusCode).toBe(401);
      expect(prismaMock.genre.update).not.toHaveBeenCalled();

      const validRes = await app.inject({
        method: "PUT",
        url: "/api/genres/terror",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
        payload: { name: "Horror" },
      });
      expect(validRes.statusCode).toBe(200);
      expect(validRes.json().data.name).toBe("Horror");

      const notFoundRes = await app.inject({
        method: "PUT",
        url: "/api/genres/unknown",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
        payload: { name: "Horror" },
      });
      expect(notFoundRes.statusCode).toBe(404);
      expect(notFoundRes.json()).toEqual({ data: null });

      await app.close();
    });

    it("returns 401 for DELETE /api/genres/:slug without valid X-Admin-Key and deletes when valid", async () => {
      const prismaMock = createPrismaMock(makeGenre());
      const app = buildTestApp({ prisma: prismaMock });

      const missingRes = await app.inject({
        method: "DELETE",
        url: "/api/genres/terror",
      });
      expect(missingRes.statusCode).toBe(401);
      expect(missingRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const invalidRes = await app.inject({
        method: "DELETE",
        url: "/api/genres/terror",
        headers: { "x-admin-key": "wrong-key" },
      });
      expect(invalidRes.statusCode).toBe(401);
      expect(prismaMock.genre.delete).not.toHaveBeenCalled();

      const validRes = await app.inject({
        method: "DELETE",
        url: "/api/genres/terror",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
      });
      expect(validRes.statusCode).toBe(200);
      expect(validRes.json()).toEqual({
        message: 'Genre "terror" deleted successfully.',
      });

      const notFoundRes = await app.inject({
        method: "DELETE",
        url: "/api/genres/unknown",
        headers: { "x-admin-key": env.ADMIN_API_KEY },
      });
      expect(notFoundRes.statusCode).toBe(404);
      expect(notFoundRes.json()).toEqual({ data: null });

      await app.close();
    });
  });
});
