import fastify from "fastify";
import { describe, expect, it, mock } from "bun:test";
import { ZodError } from "zod";

import { env, envSchema } from "@/config/env";

import {
  adminAuthMiddleware,
  createAdminAuthMiddleware,
  verifyAdminApiKey,
} from "./admin-auth.middleware";

describe("admin-auth.middleware", () => {
  describe("verifyAdminApiKey", () => {
    it("returns true for an exact matching key", () => {
      expect(verifyAdminApiKey("secret-admin-key", "secret-admin-key")).toBe(
        true,
      );
    });

    it("returns false without throwing RangeError for missing, empty, non-string, or different-length keys", () => {
      expect(verifyAdminApiKey(undefined, "secret-admin-key")).toBe(false);
      expect(verifyAdminApiKey(null, "secret-admin-key")).toBe(false);
      expect(verifyAdminApiKey("", "secret-admin-key")).toBe(false);
      expect(
        verifyAdminApiKey(["secret-admin-key", "extra"], "secret-admin-key"),
      ).toBe(false);
      expect(verifyAdminApiKey("short", "secret-admin-key")).toBe(false);
      expect(
        verifyAdminApiKey("secret-admin-key-longer", "secret-admin-key"),
      ).toBe(false);
      // Same JS string length (3) but different UTF-8 byte length (4 vs 3)
      expect(verifyAdminApiKey("ábç", "abc")).toBe(false);
      // Same byte length, different content
      expect(verifyAdminApiKey("secret-admin-kez", "secret-admin-key")).toBe(
        false,
      );
      expect(verifyAdminApiKey("secret-admin-key", "")).toBe(false);
      expect(verifyAdminApiKey("k", null as unknown as string)).toBe(false);
    });
  });

  describe("adminAuthMiddleware", () => {
    const buildTestApp = (middleware = adminAuthMiddleware) => {
      const app = fastify();
      const handlerSpy = mock(async () => ({ ok: true }));

      app.post(
        "/protected",
        { onRequest: [middleware] },
        handlerSpy,
      );

      return { app, handlerSpy };
    };

    it("allows requests with valid X-Admin-Key matching env.ADMIN_API_KEY", async () => {
      const { app, handlerSpy } = buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/protected",
        headers: {
          "x-admin-key": env.ADMIN_API_KEY,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(handlerSpy).toHaveBeenCalledTimes(1);

      await app.close();
    });

    it("rejects missing, empty, or invalid X-Admin-Key with 401 without calling handler", async () => {
      const { app, handlerSpy } = buildTestApp();

      const missingRes = await app.inject({
        method: "POST",
        url: "/protected",
      });
      expect(missingRes.statusCode).toBe(401);
      expect(missingRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const emptyRes = await app.inject({
        method: "POST",
        url: "/protected",
        headers: { "x-admin-key": "" },
      });
      expect(emptyRes.statusCode).toBe(401);
      expect(emptyRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const shortRes = await app.inject({
        method: "POST",
        url: "/protected",
        headers: { "x-admin-key": "bad" },
      });
      expect(shortRes.statusCode).toBe(401);
      expect(shortRes.json()).toEqual({ message: "Invalid Admin API Key" });

      const wrongSameLenRes = await app.inject({
        method: "POST",
        url: "/protected",
        headers: {
          "x-admin-key": "x".repeat(env.ADMIN_API_KEY.length),
        },
      });
      expect(wrongSameLenRes.statusCode).toBe(401);
      expect(wrongSameLenRes.json()).toEqual({
        message: "Invalid Admin API Key",
      });

      expect(handlerSpy).not.toHaveBeenCalled();

      await app.close();
    });

    it("rejects string[] X-Admin-Key header directly in onRequest without RangeError", () => {
      const middleware = createAdminAuthMiddleware("my-admin-key");
      const statusCalls: number[] = [];
      const sentPayloads: unknown[] = [];
      const doneMock = mock();

      const fakeReq = {
        headers: {
          "x-admin-key": ["my-admin-key", "duplicate"],
        },
      } as unknown as Parameters<typeof middleware>[0];

      const fakeRes = {
        status(code: number) {
          statusCalls.push(code);
          return this;
        },
        send(payload: unknown) {
          sentPayloads.push(payload);
          return payload;
        },
      } as unknown as Parameters<typeof middleware>[1];

      middleware.call(
        {} as ThisParameterType<typeof middleware>,
        fakeReq,
        fakeRes,
        doneMock,
      );

      expect(statusCalls).toEqual([401]);
      expect(sentPayloads).toEqual([{ message: "Invalid Admin API Key" }]);
      expect(doneMock).not.toHaveBeenCalled();
    });

    it("invokes done() when X-Admin-Key matches directly in onRequest", () => {
      const middleware = createAdminAuthMiddleware("my-admin-key");
      const doneMock = mock();
      const statusMock = mock();

      const fakeReq = {
        headers: {
          "x-admin-key": "my-admin-key",
        },
      } as unknown as Parameters<typeof middleware>[0];

      const fakeRes = {
        status: statusMock,
      } as unknown as Parameters<typeof middleware>[1];

      middleware.call(
        {} as ThisParameterType<typeof middleware>,
        fakeReq,
        fakeRes,
        doneMock,
      );

      expect(doneMock).toHaveBeenCalledTimes(1);
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe("envSchema ADMIN_API_KEY validation", () => {
    const baseEnv = {
      OPENAI_API_KEY: "sk-test-key",
      DATABASE_URL: "postgresql://dev:dev@localhost:5432/librarium_test",
      REDIS_URL: "redis://localhost:6379",
    };

    it("requires non-empty ADMIN_API_KEY without surrounding whitespace across development, test, and production", () => {
      for (const nodeEnv of ["development", "test", "production"] as const) {
        expect(() =>
          envSchema.parse({
            ...baseEnv,
            NODE_ENV: nodeEnv,
          }),
        ).toThrow(ZodError);

        expect(() =>
          envSchema.parse({
            ...baseEnv,
            NODE_ENV: nodeEnv,
            ADMIN_API_KEY: "",
          }),
        ).toThrow(ZodError);

        expect(() =>
          envSchema.parse({
            ...baseEnv,
            NODE_ENV: nodeEnv,
            ADMIN_API_KEY: "   ",
          }),
        ).toThrow(ZodError);

        expect(() =>
          envSchema.parse({
            ...baseEnv,
            NODE_ENV: nodeEnv,
            ADMIN_API_KEY: " key ",
          }),
        ).toThrow(ZodError);

        const parsed = envSchema.parse({
          ...baseEnv,
          NODE_ENV: nodeEnv,
          ADMIN_API_KEY: "valid-admin-key",
        });
        expect(parsed.ADMIN_API_KEY).toBe("valid-admin-key");
      }
    });
  });
});
