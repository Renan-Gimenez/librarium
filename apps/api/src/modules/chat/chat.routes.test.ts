import { describe, expect, it, mock } from "bun:test";
import { fastify } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { errorHandler } from "@/errors";

import { chatRoutes } from "./chat.routes";
import type { ProcessChatMessageResult } from "./chat.service";

function buildTestApp(
  processMessage?: (input: {
    token: string;
    message: string;
  }) => Promise<ProcessChatMessageResult>,
) {
  const app = fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.decorateRequest("token", null);

  app.register(chatRoutes, {
    prefix: "/api/chat",
    processMessage,
  });

  return app;
}

describe("chat.routes", () => {
  it("returns 401 when Bearer token is missing", async () => {
    const processMessageMock = mock(async () => {
      throw new Error("Should not execute handler without auth");
    });
    const app = buildTestApp(processMessageMock);

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
    const app = buildTestApp(processMessageMock);

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
    const app = buildTestApp(processMessageMock);

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
    expect(processMessageMock).toHaveBeenCalledWith({
      token: "session-token-abc",
      message: "Quero livros sobre solidão no espaço e ficção",
    });

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
});
