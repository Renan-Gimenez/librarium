import { describe, expect, it, spyOn } from "bun:test";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

import { api } from "@/lib/api";
import { sendChatMessage } from "./chat";
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
});

