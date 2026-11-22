import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import { describe, expect, it, mock } from "bun:test";
import { fastify } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { APIUserAbortError } from "openai";

import { AppError, ConflictError, errorHandler } from "@/errors";

import {
  chatRoutes,
  extractStreamErrorMessage,
  type ChatRoutesOptions,
} from "./chat.routes";
import type { ProcessChatMessageResult } from "./chat.service";

function buildTestApp(options: ChatRoutesOptions = {}) {
  const app = fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.decorateRequest("token", null);

  app.register(chatRoutes, {
    prefix: "/api/chat",
    ...options,
  });

  return app;
}

function parseSseFrames(rawPayload: string) {
  return rawPayload
    .trim()
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      let event = "message";
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trimStart());
        }
      }

      return {
        event,
        data: JSON.parse(dataLines.join("\n")) as unknown,
      };
    });
}

describe("chat.routes", () => {
  it("returns 401 when Bearer token is missing", async () => {
    const processMessageMock = mock(async () => {
      throw new Error("Should not execute handler without auth");
    });
    const app = buildTestApp({ processMessage: processMessageMock });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "Olá" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Invalid API Key" });
    expect(processMessageMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns 400 when body fails Zod validation (empty or whitespace message)", async () => {
    const processMessageMock = mock(async () => {
      throw new Error("Should not execute handler with invalid body");
    });
    const app = buildTestApp({ processMessage: processMessageMock });

    const emptyResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: {
        authorization: "Bearer session-token-1",
      },
      payload: { message: "   " },
    });

    expect(emptyResponse.statusCode).toBe(400);
    expect(emptyResponse.json()).toMatchObject({
      statusCode: 400,
      error: "Validation Error",
    });
    expect(processMessageMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("validates request, delegates to processMessage, and serializes 200 payload with publishedAt ISO, books, and meta.usage", async () => {
    const serviceResult: ProcessChatMessageResult = {
      data: {
        userMessage: "Quero livros sobre solidão no espaço e ficção",
        modelReply:
          "Recomendo **Solaris** por Stanislaw Lem e **Fundação** por Isaac Asimov.",
        books: [
          {
            id: "book-sem-1",
            title: "Solaris",
            author: "Stanislaw Lem",
            description: "Solidão no espaço.",
            coverUrl: "https://example.com/solaris.jpg",
            rating: 4.8,
            publishedAt: "1961-01-01T00:00:00.000Z",
            genres: [{ slug: "ficcao-cientifica", name: "Ficção Científica" }],
            similarity: 88,
          },
          {
            id: "book-str-1",
            title: "Fundação",
            author: "Isaac Asimov",
            description: "Império galáctico.",
            coverUrl: null,
            rating: 4.9,
            publishedAt: "1951-01-01T00:00:00.000Z",
            genres: [{ slug: "ficcao", name: "Ficção" }],
          },
        ],
      },
      meta: {
        usage: {
          promptTokens: 320,
          completionTokens: 45,
          totalTokens: 365,
        },
      },
    };

    const processMessageMock = mock(async () => serviceResult);
    const app = buildTestApp({ processMessage: processMessageMock });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: {
        authorization: "Bearer session-token-abc",
      },
      payload: {
        message: "  Quero livros sobre solidão no espaço e ficção  ",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(processMessageMock).toHaveBeenCalledTimes(1);
    expect(processMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "session-token-abc",
        message: "Quero livros sobre solidão no espaço e ficção",
        logger: expect.any(Object),
      }),
    );

    const body = response.json() as ProcessChatMessageResult;
    expect(body).toEqual(serviceResult);
    expect(body.data.books[0]?.publishedAt).toBe("1961-01-01T00:00:00.000Z");
    expect(body.data.books[0]?.similarity).toBe(88);
    expect("similarity" in body.data.books[1]!).toBe(false);
    expect(body.meta.usage).toEqual({
      promptTokens: 320,
      completionTokens: 45,
      totalTokens: 365,
    });

    await app.close();
  });

  it("returns 400 when message exceeds 2000 characters after trim and accepts exactly 2000", async () => {
    const processMessageMock = mock(async (input) => ({
      data: {
        userMessage: input.message,
        modelReply: "Ok",
        books: [],
      },
      meta: { usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
    }));
    const app = buildTestApp({ processMessage: processMessageMock });

    const tooLongRes = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: "Bearer session-token-len" },
      payload: { message: `  ${"a".repeat(2001)}  ` },
    });

    expect(tooLongRes.statusCode).toBe(400);
    expect(processMessageMock).not.toHaveBeenCalled();

    const exactRes = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: "Bearer session-token-len" },
      payload: { message: `  ${"a".repeat(2000)}  ` },
    });

    expect(exactRes.statusCode).toBe(200);
    expect(processMessageMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("returns 409 Conflict when processMessage throws ConflictError", async () => {
    const processMessageMock = mock(async () => {
      throw new ConflictError("A chat request is already in progress for this session.");
    });
    const app = buildTestApp({ processMessage: processMessageMock });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: "Bearer session-conflict" },
      payload: { message: "Olá" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      statusCode: 409,
      error: "Conflict",
    });

    await app.close();
  });

  describe("POST /api/chat/stream", () => {
    it("returns 401 JSON when Bearer token is missing without hijacking response", async () => {
      const streamMock = mock(async () => {
        throw new Error("Should not execute stream handler without auth");
      });
      const app = buildTestApp({ streamMessage: streamMock });

      const response = await app.inject({
        method: "POST",
        url: "/api/chat/stream",
        payload: { message: "Olá" },
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.json()).toEqual({ message: "Invalid API Key" });
      expect(streamMock).not.toHaveBeenCalled();

      await app.close();
    });

    it("returns 400 JSON when body fails Zod validation without hijacking response", async () => {
      const streamMock = mock(async () => {
        throw new Error("Should not execute stream handler with invalid body");
      });
      const app = buildTestApp({ streamMessage: streamMock });

      const response = await app.inject({
        method: "POST",
        url: "/api/chat/stream",
        headers: {
          authorization: "Bearer session-token-stream-1",
        },
        payload: { message: "   " },
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.json()).toMatchObject({
        statusCode: 400,
        error: "Validation Error",
      });
      expect(streamMock).not.toHaveBeenCalled();

      await app.close();
    });

    it("returns 400 JSON when stream message exceeds 2000 characters after trim without hijacking", async () => {
      const streamMock = mock(async () => {
        throw new Error("Should not execute stream handler with >2000 chars");
      });
      const app = buildTestApp({ streamMessage: streamMock });

      const response = await app.inject({
        method: "POST",
        url: "/api/chat/stream",
        headers: {
          authorization: "Bearer session-token-stream-len",
        },
        payload: { message: "x".repeat(2001) },
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(streamMock).not.toHaveBeenCalled();

      const exact2000Mock = mock(async (input) => {
        input.onStreamStart?.();
        return {
          data: {
            userMessage: input.message,
            modelReply: "Ok 2000",
            books: [],
          },
          meta: {
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          },
        };
      });
      const appExact = buildTestApp({ streamMessage: exact2000Mock });
      const exactRes = await appExact.inject({
        method: "POST",
        url: "/api/chat/stream",
        headers: {
          authorization: "Bearer session-token-stream-len",
        },
        payload: { message: `  ${"x".repeat(2000)}  ` },
      });

      expect(exactRes.statusCode).toBe(200);
      expect(exactRes.headers["content-type"]).toContain("text/event-stream");
      expect(exact2000Mock).toHaveBeenCalledTimes(1);

      await appExact.close();
      await app.close();
    });

    it("returns 409 JSON without hijacking when streamMessage throws ConflictError pre-stream and starts SSE stream when onStreamStart fires before deltas", async () => {
      const streamMock = mock(async () => {
        throw new ConflictError("Concurrent turn in progress");
      });
      const app = buildTestApp({ streamMessage: streamMock });

      const response = await app.inject({
        method: "POST",
        url: "/api/chat/stream",
        headers: {
          authorization: "Bearer session-stream-conflict",
        },
        payload: { message: "Olá" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.json()).toEqual({
        statusCode: 409,
        error: "Conflict",
        message: "Concurrent turn in progress",
      });

      const appStart = buildTestApp({
        streamMessage: mock(async (input) => {
          input.onStreamStart?.();
          throw new ConflictError("Late 409 after stream started");
        }),
      });
      const resAfterStart = await appStart.inject({
        method: "POST",
        url: "/api/chat/stream",
        headers: {
          authorization: "Bearer session-stream-started",
        },
        payload: { message: "Olá" },
      });

      expect(resAfterStart.statusCode).toBe(200);
      expect(resAfterStart.headers["content-type"]).toContain(
        "text/event-stream",
      );

      await appStart.close();
      await app.close();
    });

    it("streams SSE delta and done events and preserves CORS + rate-limit headers with res.hijack()", async () => {
      const app = fastify().withTypeProvider<ZodTypeProvider>();
      app.setValidatorCompiler(validatorCompiler);
      app.setSerializerCompiler(serializerCompiler);
      app.setErrorHandler(errorHandler);
      app.decorateRequest("token", null);

      app.register(fastifyCors, {
        origin: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
      });

      app.register(fastifyRateLimit, {
        global: false,
        max: 100,
        timeWindow: "1 minute",
      });

      app.register(fastifySwagger, {
        openapi: {
          info: { title: "Test API", version: "1.0.0" },
        },
        transform: jsonSchemaTransform,
      });

      const finalResult: ProcessChatMessageResult = {
        data: {
          userMessage: "Recomende Solaris",
          modelReply: "Recomendo **Solaris** de Stanislaw Lem.",
          books: [
            {
              id: "sol-1",
              title: "Solaris",
              author: "Stanislaw Lem",
              description: "Solidão espacial.",
              coverUrl: null,
              rating: 4.8,
              publishedAt: "1961-01-01T00:00:00.000Z",
              genres: [{ slug: "sci-fi", name: "Ficção Científica" }],
              similarity: 91,
            },
          ],
        },
        meta: {
          usage: {
            promptTokens: 150,
            completionTokens: 20,
            totalTokens: 170,
          },
        },
      };

      const streamMock = mock(async (input) => {
        input.onDelta?.("Recomendo ");
        input.onDelta?.("**Solaris** de Stanislaw Lem.");
        return finalResult;
      });

      app.register(chatRoutes, {
        prefix: "/api/chat",
        streamMessage: streamMock,
      });

      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/chat/stream",
        headers: {
          authorization: "Bearer session-sse-cors",
          origin: "http://localhost:5173",
        },
        payload: { message: "  Recomende Solaris  " },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe(
        "text/event-stream; charset=utf-8",
      );
      expect(response.headers["cache-control"]).toBe("no-cache, no-transform");
      expect(response.headers["access-control-allow-origin"]).toBe(
        "http://localhost:5173",
      );
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
      expect(response.headers["x-ratelimit-limit"]).toBeDefined();
      expect(response.headers["x-ratelimit-remaining"]).toBeDefined();

      expect(streamMock).toHaveBeenCalledTimes(1);
      expect(streamMock.mock.calls[0]?.[0]).toMatchObject({
        token: "session-sse-cors",
        message: "Recomende Solaris",
      });

      const events = parseSseFrames(response.payload);
      expect(events).toEqual([
        { event: "delta", data: { content: "Recomendo " } },
        { event: "delta", data: { content: "**Solaris** de Stanislaw Lem." } },
        { event: "done", data: finalResult },
      ]);

      await app.close();
    });

    it("returns 429 JSON error when chat rate limit is exceeded without hijacking", async () => {
      const app = fastify().withTypeProvider<ZodTypeProvider>();
      app.setValidatorCompiler(validatorCompiler);
      app.setSerializerCompiler(serializerCompiler);
      app.setErrorHandler(errorHandler);
      app.decorateRequest("token", null);

      app.register(fastifyRateLimit, {
        global: false,
        max: 100,
        timeWindow: "1 minute",
        errorResponseBuilder: (_req, context) => ({
          statusCode: 429,
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again in ${context.after}.`,
        }),
      });

      const streamMock = mock(async () => ({
        data: { userMessage: "Oi", modelReply: "Olá!", books: [] },
        meta: {
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        },
      }));

      app.register(chatRoutes, {
        prefix: "/api/chat",
        streamMessage: streamMock,
      });

      // Exhaust route-level RATE_LIMIT_CHAT_MAX (default 15)
      let hit429 = false;
      for (let i = 0; i < 20; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/api/chat/stream",
          headers: { authorization: "Bearer rate-limit-user" },
          payload: { message: "Oi" },
        });
        if (res.statusCode === 429) {
          hit429 = true;
          expect(res.headers["content-type"]).toContain("application/json");
          expect(res.json()).toMatchObject({
            statusCode: 429,
            error: "Too Many Requests",
          });
          break;
        }
        expect(res.statusCode).toBe(200);
      }

      expect(hit429).toBe(true);
      await app.close();
    });

    it("emits SSE error event mid-stream and closes cleanly without crashing", async () => {
      const streamMock = mock(async (input) => {
        input.onDelta?.("Parcial ");
        throw new Error("Falha inesperada da OpenAI");
      });

      const app = buildTestApp({ streamMessage: streamMock });

      const response = await app.inject({
        method: "POST",
        url: "/api/chat/stream",
        headers: { authorization: "Bearer session-mid-err" },
        payload: { message: "Olá" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe(
        "text/event-stream; charset=utf-8",
      );

      const events = parseSseFrames(response.payload);
      expect(events).toEqual([
        { event: "delta", data: { content: "Parcial " } },
        { event: "error", data: { message: "Falha inesperada da OpenAI" } },
      ]);

      await app.close();
    });

    it("aborts server signal via res.raw close event when HTTP client disconnects mid-stream without logging error or emitting SSE error", async () => {
      let capturedSignal: AbortSignal | undefined;
      let streamAbortedPromise: Promise<void> | undefined;
      const logErrorSpy = mock();
      const writtenChunks: string[] = [];

      const streamMock = mock(async (input) => {
        capturedSignal = input.signal;
        input.onDelta?.("Primeiro token");

        await new Promise<void>((resolve, reject) => {
          const fallbackTimer = setTimeout(resolve, 2000);
          streamAbortedPromise = new Promise<void>((resAbort) => {
            input.signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(fallbackTimer);
                resAbort();
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          });
        });

        return {
          data: { userMessage: input.message, modelReply: "Nunca", books: [] },
          meta: {
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          },
        };
      });

      const app = buildTestApp({ streamMessage: streamMock });
      app.addHook("onRequest", async (req, res) => {
        req.log.error = logErrorSpy as unknown as typeof req.log.error;
        const origWrite = res.raw.write.bind(res.raw);
        res.raw.write = ((chunk: unknown, ...args: unknown[]) => {
          writtenChunks.push(String(chunk));
          return (origWrite as (...a: unknown[]) => boolean)(chunk, ...args);
        }) as typeof res.raw.write;
      });

      const address = await app.listen({ port: 0, host: "127.0.0.1" });

      try {
        const clientAbort = new AbortController();
        const res = await fetch(`${address}/api/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer session-real-abort",
          },
          body: JSON.stringify({ message: "Teste abort HTTP" }),
          signal: clientAbort.signal,
        });

        expect(res.status).toBe(200);
        const reader = res.body!.getReader();
        const firstRead = await reader.read();
        const decoded = new TextDecoder().decode(firstRead.value);
        expect(decoded).toContain("Primeiro token");
        expect(capturedSignal?.aborted).toBe(false);

        clientAbort.abort();
        await reader.cancel().catch(() => {});

        await streamAbortedPromise;
        // Let route catch/finally settle before asserting no error logs/writes occurred
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(capturedSignal?.aborted).toBe(true);
        expect(logErrorSpy).not.toHaveBeenCalled();
        expect(writtenChunks.join("")).not.toContain("event: error");
      } finally {
        await app.close();
      }
    });

    it("emits SSE error event and logs error when streamMessage rejects with AppError", async () => {
      const logErrorSpy = mock();
      const streamMock = mock(async () => {
        throw new AppError("Serviço temporariamente indisponível", 503);
      });

      const app = buildTestApp({ streamMessage: streamMock });
      app.addHook("onRequest", async (req) => {
        req.log.error = logErrorSpy as unknown as typeof req.log.error;
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/chat/stream",
        headers: { authorization: "Bearer session-app-err" },
        payload: { message: "Olá" },
      });

      expect(response.statusCode).toBe(200);
      expect(logErrorSpy).toHaveBeenCalledTimes(1);
      expect(parseSseFrames(response.payload)).toEqual([
        {
          event: "error",
          data: { message: "Serviço temporariamente indisponível" },
        },
      ]);

      await app.close();
    });

    it("emits SSE error event and logs error when streamMessage throws APIUserAbortError while HTTP client is still connected", async () => {
      const logErrorSpy = mock();
      const streamMock = mock(async (input) => {
        expect(input.signal?.aborted).toBe(false);
        throw new APIUserAbortError({ message: "Upstream OpenAI request aborted" });
      });

      const app = buildTestApp({ streamMessage: streamMock });
      app.addHook("onRequest", async (req) => {
        req.log.error = logErrorSpy as unknown as typeof req.log.error;
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/chat/stream",
        headers: { authorization: "Bearer session-upstream-abort" },
        payload: { message: "Olá" },
      });

      expect(response.statusCode).toBe(200);
      expect(logErrorSpy).toHaveBeenCalledTimes(1);
      expect(parseSseFrames(response.payload)).toEqual([
        {
          event: "error",
          data: { message: "Upstream OpenAI request aborted" },
        },
      ]);

      await app.close();
    });

    describe("extractStreamErrorMessage", () => {
      it("sanitizes generic Error and non-Error values in production while preserving AppError.message", () => {
        expect(
          extractStreamErrorMessage(new Error("Sensitive SQL trace"), true),
        ).toBe("Ocorreu um erro ao processar a resposta do assistente.");
        expect(extractStreamErrorMessage("raw string error", true)).toBe(
          "Ocorreu um erro ao processar a resposta do assistente.",
        );
        expect(
          extractStreamErrorMessage(new AppError("Erro de domínio", 422), true),
        ).toBe("Erro de domínio");
      });

      it("exposes Error.message outside production and falls back for non-Error values", () => {
        expect(
          extractStreamErrorMessage(new Error("Detailed dev error"), false),
        ).toBe("Detailed dev error");
        expect(extractStreamErrorMessage({ code: 500 }, false)).toBe(
          "Ocorreu um erro ao processar a resposta do assistente.",
        );
      });
    });
  });
});
