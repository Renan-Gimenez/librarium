import { describe, expect, it, spyOn } from "bun:test";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

import { api } from "@/lib/api";
import { sendChatMessage, streamChatMessage } from "./chat";
import type { ChatApiResponse } from "@/types/api";

function createAxiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: {},
    config: { headers: {} } as unknown as InternalAxiosRequestConfig,
  };
}

describe("chat service", () => {
  describe("sendChatMessage", () => {
    it("should successfully send message with Bearer token in headers", async () => {
      const mockResponse: ChatApiResponse = {
        data: {
          userMessage: "Indique um livro de Ficção Científica",
          modelReply: "Recomendo Duna, de Frank Herbert.",
        },
        meta: {
          usage: {
            promptTokens: 100,
            completionTokens: 20,
            totalTokens: 120,
          },
        },
      };

      const postSpy = spyOn(api, "post").mockResolvedValueOnce(
        createAxiosResponse(mockResponse)
      );

      const result = await sendChatMessage({
        message: "Indique um livro de Ficção Científica",
        sessionId: "session-uuid-1234",
      });

      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith(
        "/chat",
        { message: "Indique um livro de Ficção Científica" },
        expect.objectContaining({
          headers: {
            Authorization: "Bearer session-uuid-1234",
          },
        })
      );
      expect(result).toEqual(mockResponse);
      postSpy.mockRestore();
    });

    it("should throw error if message is empty or whitespace", async () => {
      expect(
        sendChatMessage({
          message: "   ",
          sessionId: "session-uuid-1234",
        })
      ).rejects.toThrow("A mensagem não pode ser vazia.");
    });

    it("should throw error if sessionId is empty or whitespace", async () => {
      expect(
        sendChatMessage({
          message: "Olá",
          sessionId: "   ",
        })
      ).rejects.toThrow("Um sessionId válido é obrigatório.");
    });

    it("should propagate signal for cancellation if provided", async () => {
      const mockResponse: ChatApiResponse = {
        data: {
          userMessage: "Teste",
          modelReply: "Resposta",
        },
        meta: {
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        },
      };

      const controller = new AbortController();
      const postSpy = spyOn(api, "post").mockResolvedValueOnce(
        createAxiosResponse(mockResponse)
      );

      await sendChatMessage(
        {
          message: "Teste",
          sessionId: "session-uuid-1234",
        },
        { signal: controller.signal }
      );

      expect(postSpy).toHaveBeenCalledWith(
        "/chat",
        { message: "Teste" },
        expect.objectContaining({
          signal: controller.signal,
        })
      );

      postSpy.mockRestore();
    });
  });

  describe("streamChatMessage", () => {
    function createStreamFromChunks(chunks: Array<string | Uint8Array>) {
      const encoder = new TextEncoder();
      return new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(
              typeof chunk === "string" ? encoder.encode(chunk) : chunk,
            );
          }
          controller.close();
        },
      });
    }

    it("throws validation errors for empty message or sessionId", async () => {
      await expect(
        streamChatMessage({ message: "   ", sessionId: "session-1" }),
      ).rejects.toThrow("A mensagem não pode ser vazia.");

      await expect(
        streamChatMessage({ message: "Olá", sessionId: "  " }),
      ).rejects.toThrow("Um sessionId válido é obrigatório.");
    });

    it("posts to /chat/stream with Bearer header, emits deltas progressively, and returns done payload", async () => {
      const donePayload: ChatApiResponse = {
        data: {
          userMessage: "Recomende Solaris",
          modelReply: "Recomendo Solaris.",
          books: [
            {
              id: "sol-1",
              title: "Solaris",
              author: "Stanislaw Lem",
              similarity: 90,
            },
          ],
        },
        meta: {
          usage: { promptTokens: 100, completionTokens: 15, totalTokens: 115 },
        },
      };

      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          createStreamFromChunks([
            'event: delta\ndata: {"content":"Recomendo "}\n\n',
            'event: delta\ndata: {"content":"Solaris."}\n\n',
            `event: done\ndata: ${JSON.stringify(donePayload)}\n\n`,
          ]),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream; charset=utf-8" },
          },
        ),
      );

      const controller = new AbortController();
      const deltas: string[] = [];
      const result = await streamChatMessage(
        {
          message: "  Recomende Solaris  ",
          sessionId: "session-sse-1",
        },
        {
          signal: controller.signal,
          onDelta: (delta) => deltas.push(delta),
        },
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchSpy.mock.calls[0]!;
      expect(calledUrl).toBe(`${api.defaults.baseURL}/chat/stream`);
      expect(calledInit).toMatchObject({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: "Bearer session-sse-1",
        },
        body: JSON.stringify({ message: "Recomende Solaris" }),
        signal: controller.signal,
      });

      expect(deltas).toEqual(["Recomendo ", "Solaris."]);
      expect(result).toEqual(donePayload);

      fetchSpy.mockRestore();
    });

    it("reassembles fragmented frames, split CRLF delimiters, multi-byte UTF-8 chars, and multiple events in one chunk", async () => {
      const donePayload: ChatApiResponse = {
        data: {
          userMessage: "Ação",
          modelReply: "Ficção Científica 📚!",
          books: [],
        },
        meta: {
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        },
      };

      // Split multi-byte UTF-8 string across chunk boundaries and split \r\n\r\n
      const encoder = new TextEncoder();
      const firstFrameBytes = encoder.encode(
        'event: delta\r\ndata: {"content":"Ficção "}\r',
      );
      const utf8EmojiPart = encoder.encode(
        `\n\r\nevent: delta\r\ndata: {"content":"Científica 📚"}\r\n\r\n`,
      );
      const emojiSplitA = utf8EmojiPart.slice(0, utf8EmojiPart.length - 8);
      const emojiSplitB = utf8EmojiPart.slice(utf8EmojiPart.length - 8);

      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          createStreamFromChunks([
            ": keep-alive\n\n",
            firstFrameBytes,
            emojiSplitA,
            emojiSplitB,
            `event: delta\ndata: {"content":"!"}\n\nevent: done\ndata: ${JSON.stringify(donePayload)}\n\n`,
          ]),
          { status: 200 },
        ),
      );

      const deltas: string[] = [];
      const result = await streamChatMessage(
        { message: "Ação", sessionId: "session-frag" },
        { onDelta: (delta) => deltas.push(delta) },
      );

      expect(deltas).toEqual(["Ficção ", "Científica 📚", "!"]);
      expect(result).toEqual(donePayload);

      fetchSpy.mockRestore();
    });

    it("throws parsed API error message for pre-stream 401/400/429 JSON responses", async () => {
      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 429,
            error: "Too Many Requests",
            message: "Rate limit exceeded. Try again in 1 minute.",
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      await expect(
        streamChatMessage({ message: "Oi", sessionId: "session-429" }),
      ).rejects.toThrow("Rate limit exceeded. Try again in 1 minute.");

      fetchSpy.mockRestore();
    });

    it("throws error event message when backend emits event: error mid-stream", async () => {
      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          createStreamFromChunks([
            'event: delta\ndata: {"content":"Parcial "}\n\n',
            'event: error\ndata: {"message":"Falha ao consultar o modelo."}\n\n',
          ]),
          { status: 200 },
        ),
      );

      const deltas: string[] = [];
      await expect(
        streamChatMessage(
          { message: "Oi", sessionId: "session-mid-err" },
          { onDelta: (delta) => deltas.push(delta) },
        ),
      ).rejects.toThrow("Falha ao consultar o modelo.");

      expect(deltas).toEqual(["Parcial "]);
      fetchSpy.mockRestore();
    });

    it("throws error when stream reaches EOF without event: done", async () => {
      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          createStreamFromChunks([
            'event: delta\ndata: {"content":"Incompleto"}\n\n',
          ]),
          { status: 200 },
        ),
      );

      await expect(
        streamChatMessage({ message: "Oi", sessionId: "session-eof" }),
      ).rejects.toThrow("Conexão encerrada antes da conclusão da resposta.");

      fetchSpy.mockRestore();
    });

    it("cancels active stream read and rejects with AbortError when AbortController aborts", async () => {
      const controller = new AbortController();
      let streamCancelled = false;

      const stream = new ReadableStream<Uint8Array>({
        start(streamCtrl) {
          streamCtrl.enqueue(
            new TextEncoder().encode(
              'event: delta\ndata: {"content":"Primeiro"}\n\n',
            ),
          );
        },
        cancel() {
          streamCancelled = true;
        },
      });

      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(stream, { status: 200 }),
      );

      const deltas: string[] = [];
      const promise = streamChatMessage(
        { message: "Oi", sessionId: "session-abort" },
        {
          signal: controller.signal,
          onDelta: (delta) => {
            deltas.push(delta);
            controller.abort();
          },
        },
      );

      await expect(promise).rejects.toMatchObject({ name: "AbortError" });
      expect(deltas).toEqual(["Primeiro"]);
      expect(streamCancelled).toBe(true);

      fetchSpy.mockRestore();
    });

    it("rejects with AbortError when aborted asynchronously while fetch() is still pending", async () => {
      const controller = new AbortController();
      const fetchSpy = spyOn(globalThis, "fetch").mockImplementationOnce((
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          })
      ) as typeof fetch);

      const promise = streamChatMessage(
        { message: "Oi", sessionId: "session-pending-fetch" },
        { signal: controller.signal },
      );

      setTimeout(() => controller.abort(), 5);

      await expect(promise).rejects.toMatchObject({ name: "AbortError" });
      fetchSpy.mockRestore();
    });

    it("cancels reader and rejects with AbortError when aborted asynchronously while reader.read() awaits next chunk", async () => {
      const controller = new AbortController();
      let streamCancelled = false;

      const stream = new ReadableStream<Uint8Array>({
        cancel() {
          streamCancelled = true;
        },
      });

      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(stream, { status: 200 }),
      );

      const promise = streamChatMessage(
        { message: "Oi", sessionId: "session-pending-read" },
        { signal: controller.signal },
      );

      setTimeout(() => controller.abort(), 10);

      await expect(promise).rejects.toMatchObject({ name: "AbortError" });
      expect(streamCancelled).toBe(true);

      fetchSpy.mockRestore();
    });

    it("aborts mid-chunk when onDelta aborts before trailing event: done in the same chunk", async () => {
      const controller = new AbortController();
      const donePayload: ChatApiResponse = {
        data: { userMessage: "Oi", modelReply: "Olá", books: [] },
        meta: {
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        },
      };

      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          createStreamFromChunks([
            `event: delta\ndata: {"content":"Olá"}\n\nevent: done\ndata: ${JSON.stringify(donePayload)}\n\n`,
          ]),
          { status: 200 },
        ),
      );

      const deltas: string[] = [];
      const promise = streamChatMessage(
        { message: "Oi", sessionId: "session-mid-chunk-abort" },
        {
          signal: controller.signal,
          onDelta: (delta) => {
            deltas.push(delta);
            controller.abort();
          },
        },
      );

      await expect(promise).rejects.toMatchObject({ name: "AbortError" });
      expect(deltas).toEqual(["Olá"]);

      fetchSpy.mockRestore();
    });

    it("preserves AbortError when aborted while reading non-OK response.text()", async () => {
      const controller = new AbortController();
      const fakeResponse = {
        ok: false,
        status: 500,
        headers: new Headers(),
        text: async () => {
          controller.abort();
          throw new DOMException("Aborted", "AbortError");
        },
      } as unknown as Response;

      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        fakeResponse,
      );

      await expect(
        streamChatMessage(
          { message: "Oi", sessionId: "session-err-abort" },
          { signal: controller.signal },
        ),
      ).rejects.toMatchObject({ name: "AbortError" });

      fetchSpy.mockRestore();
    });

    it("falls back to HTTP status error message for 502 HTML error pages", async () => {
      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("<!DOCTYPE html><html><body>502 Bad Gateway</body></html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
      );

      await expect(
        streamChatMessage({ message: "Oi", sessionId: "session-502" }),
      ).rejects.toThrow("Erro na requisição (502).");

      fetchSpy.mockRestore();
    });

    it("ignores unknown non-JSON SSE events such as ping without failing", async () => {
      const donePayload: ChatApiResponse = {
        data: { userMessage: "Oi", modelReply: "Tudo bem!", books: [] },
        meta: {
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        },
      };

      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          createStreamFromChunks([
            "event: ping\ndata: ok\n\n",
            'event: delta\ndata: {"content":"Tudo bem!"}\n\n',
            `event: done\ndata: ${JSON.stringify(donePayload)}\n\n`,
          ]),
          { status: 200 },
        ),
      );

      const deltas: string[] = [];
      const result = await streamChatMessage(
        { message: "Oi", sessionId: "session-ping" },
        { onDelta: (d) => deltas.push(d) },
      );

      expect(deltas).toEqual(["Tudo bem!"]);
      expect(result).toEqual(donePayload);

      fetchSpy.mockRestore();
    });

    it("throws descriptive errors for invalid delta JSON, invalid done payload, and 200 text/html responses", async () => {
      // 1. Invalid JSON in delta
      const badJsonSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          createStreamFromChunks(["event: delta\ndata: {broken-json\n\n"]),
          { status: 200 },
        ),
      );
      await expect(
        streamChatMessage({ message: "Oi", sessionId: "session-bad-json" }),
      ).rejects.toThrow("Resposta inválida recebida durante o streaming.");
      badJsonSpy.mockRestore();

      // 2. Invalid done payload (books not an array)
      const badDoneSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          createStreamFromChunks([
            'event: done\ndata: {"data":{"userMessage":"Oi","modelReply":"Ok","books":"invalid"}}\n\n',
          ]),
          { status: 200 },
        ),
      );
      await expect(
        streamChatMessage({ message: "Oi", sessionId: "session-bad-done" }),
      ).rejects.toThrow("Payload final de streaming inválido.");
      badDoneSpy.mockRestore();

      // 3. 200 text/html unsupported Content-Type
      const html200Spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("<html><body>Login</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      );
      await expect(
        streamChatMessage({ message: "Oi", sessionId: "session-html-200" }),
      ).rejects.toThrow(
        "Resposta inesperada do servidor (formato não suportado).",
      );
      html200Spy.mockRestore();
    });
  });
});

