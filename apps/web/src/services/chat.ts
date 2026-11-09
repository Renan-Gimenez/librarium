import { api } from "@/lib/api";
import type { ChatApiResponse } from "@/types/api";

export interface SendMessageParams {
  message: string;
  sessionId: string;
}

export interface SendMessageOptions {
  signal?: AbortSignal;
}

export async function sendChatMessage(
  params: SendMessageParams,
  options?: SendMessageOptions,
): Promise<ChatApiResponse> {
  const message = params.message?.trim();
  if (!message) {
    throw new Error("A mensagem não pode ser vazia.");
  }

  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    throw new Error("Um sessionId válido é obrigatório.");
  }

  const response = await api.post<ChatApiResponse>(
    "/chat",
    { message },
    {
      headers: {
        Authorization: `Bearer ${sessionId}`,
      },
      signal: options?.signal,
      timeout: 30000,
    },
  );

  return response.data;
}

