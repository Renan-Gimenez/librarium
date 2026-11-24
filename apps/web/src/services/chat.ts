import { api } from "@/lib/api";
import type {
  ApiErrorResponse,
  ChatApiResponse,
  ChatHistoryResponse,
  ChatMessage,
  ChatStreamDeltaEvent,
  ChatStreamErrorEvent,
} from "@/types/api";

export interface SendMessageParams {
  message: string;
  sessionId: string;
}

export interface SendMessageOptions {
  signal?: AbortSignal;
}

export interface StreamMessageOptions extends SendMessageOptions {
  onDelta?: (content: string) => void;
}

function validateChatParams(params: SendMessageParams): {
  message: string;
  sessionId: string;
} {
  const message = params.message?.trim();
  if (!message) {
    throw new Error("A mensagem não pode ser vazia.");
  }

  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    throw new Error("Um sessionId válido é obrigatório.");
  }

  return { message, sessionId };
}

function createAbortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  return new DOMException("The operation was aborted.", "AbortError");
}

function createSseParser(
  onEvent: (eventName: string, data: string) => void,
) {
  let buffer = "";
  let currentEvent = "message";
  let dataLines: string[] = [];

  const processLine = (line: string) => {
    if (line === "") {
      if (dataLines.length > 0) {
        onEvent(currentEvent, dataLines.join("\n"));
      }
      currentEvent = "message";
      dataLines = [];
      return;
    }

    if (line.startsWith(":")) {
      return;
    }

    const colonIdx = line.indexOf(":");
    const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
    let value = colonIdx === -1 ? "" : line.slice(colonIdx + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "event") {
      currentEvent = value || "message";
    } else if (field === "data") {
      dataLines.push(value);
    }
  };

  return {
    feed(chunk: string, flush: boolean) {
      if (chunk) {
        buffer += chunk;
      }

      while (buffer.length > 0) {
        const lfIdx = buffer.indexOf("\n");
        const crIdx = buffer.indexOf("\r");

        let eolIdx = -1;
        if (lfIdx !== -1 && crIdx !== -1) {
          eolIdx = Math.min(lfIdx, crIdx);
        } else if (lfIdx !== -1) {
          eolIdx = lfIdx;
        } else if (crIdx !== -1) {
          eolIdx = crIdx;
        }

        if (eolIdx === -1) {
          break;
        }

        // Wait for next chunk if \r sits at the end because \n may follow it.
        if (
          buffer[eolIdx] === "\r" &&
          eolIdx === buffer.length - 1 &&
          !flush
        ) {
          break;
        }

        const line = buffer.slice(0, eolIdx);
        const advance =
          buffer[eolIdx] === "\r" && buffer[eolIdx + 1] === "\n" ? 2 : 1;
        buffer = buffer.slice(eolIdx + advance);

        processLine(line);
      }
    },
  };
}

export async function sendChatMessage(
  params: SendMessageParams,
  options?: SendMessageOptions,
): Promise<ChatApiResponse> {
  const { message, sessionId } = validateChatParams(params);

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

/**
 * Consumes `POST /chat/stream` via Fetch + ReadableStream and an incremental SSE parser.
 */
export async function streamChatMessage(
  params: SendMessageParams,
  options?: StreamMessageOptions,
): Promise<ChatApiResponse> {
  const { message, sessionId } = validateChatParams(params);

  if (options?.signal?.aborted) {
    throw createAbortError(options.signal);
  }

  const baseUrl = (api.defaults.baseURL || "http://localhost:3333/api").replace(
    /\/+$/,
    "",
  );

  const response = await fetch(`${baseUrl}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${sessionId}`,
    },
    body: JSON.stringify({ message }),
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorMessage =
      response.status === 409
        ? "Já existe uma resposta em andamento nesta sessão. Aguarde a conclusão e tente novamente."
        : `Erro na requisição (${response.status}).`;
    try {
      const rawText = await response.text();
      const trimmed = rawText.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed) as Partial<ApiErrorResponse>;
          if (typeof parsed?.message === "string" && parsed.message.trim()) {
            errorMessage = parsed.message;
          } else if (
            !/^<!doctype|^<html/i.test(trimmed) &&
            trimmed.length <= 300
          ) {
            errorMessage = trimmed;
          }
        } catch {
          if (
            !/^<!doctype|^<html/i.test(trimmed) &&
            trimmed.length <= 300
          ) {
            errorMessage = trimmed;
          }
        }
      }
    } catch (err) {
      if (
        options?.signal?.aborted ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        throw createAbortError(options?.signal);
      }
    }
    if (options?.signal?.aborted) {
      throw createAbortError(options.signal);
    }
    throw new Error(errorMessage);
  }

  const contentType = response.headers.get("content-type");
  if (
    contentType &&
    !contentType.toLowerCase().includes("text/event-stream")
  ) {
    throw new Error("Resposta inesperada do servidor (formato não suportado).");
  }

  if (!response.body) {
    throw new Error("A resposta em streaming não contém corpo de dados.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let doneResponse: ChatApiResponse | null = null;
  const signal = options?.signal;
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  const parser = createSseParser((eventName, rawData) => {
    if (signal?.aborted) {
      throw createAbortError(signal);
    }

    if (
      eventName !== "delta" &&
      eventName !== "done" &&
      eventName !== "error"
    ) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      throw new Error("Resposta inválida recebida durante o streaming.");
    }

    if (eventName === "delta") {
      const payload = parsed as Partial<ChatStreamDeltaEvent> | null;
      if (typeof payload?.content === "string" && payload.content.length > 0) {
        options?.onDelta?.(payload.content);
        if (signal?.aborted) {
          throw createAbortError(signal);
        }
      }
      return;
    }

    if (eventName === "done") {
      const payload = parsed as Partial<ChatApiResponse> | null;
      if (
        !payload?.data ||
        typeof payload.data.modelReply !== "string" ||
        (payload.data.books !== undefined && !Array.isArray(payload.data.books))
      ) {
        throw new Error("Payload final de streaming inválido.");
      }
      doneResponse = payload as ChatApiResponse;
      return;
    }

    if (eventName === "error") {
      const payload = parsed as Partial<ChatStreamErrorEvent> | null;
      const msg =
        typeof payload?.message === "string" && payload.message.trim()
          ? payload.message
          : "Ocorreu um erro durante o streaming da resposta.";
      throw new Error(msg);
    }
  });

  try {
    while (!doneResponse) {
      if (signal?.aborted) {
        throw createAbortError(signal);
      }

      const { value, done } = await reader.read();
      if (signal?.aborted) {
        throw createAbortError(signal);
      }
      if (done) {
        parser.feed(decoder.decode(), true);
        break;
      }

      if (value) {
        parser.feed(decoder.decode(value, { stream: true }), false);
      }
    }

    if (!doneResponse) {
      if (signal?.aborted) {
        throw createAbortError(signal);
      }
      throw new Error("Conexão encerrada antes da conclusão da resposta.");
    }

    if (signal?.aborted) {
      throw createAbortError(signal);
    }

    return doneResponse;
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (doneResponse) {
      await reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }
}

export async function fetchChatHistory(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const trimmedSessionId = sessionId?.trim();
  if (!trimmedSessionId) {
    throw new Error("Um sessionId válido é obrigatório.");
  }

  const response = await api.get<ChatHistoryResponse>("/chat/history", {
    headers: {
      Authorization: `Bearer ${trimmedSessionId}`,
    },
    signal,
    timeout: 10000,
  });

  return Array.isArray(response.data?.messages) ? response.data.messages : [];
}

export async function clearChatHistory(sessionId: string): Promise<void> {
  const trimmedSessionId = sessionId?.trim();
  if (!trimmedSessionId) {
    throw new Error("Um sessionId válido é obrigatório.");
  }

  await api.delete("/chat/history", {
    headers: {
      Authorization: `Bearer ${trimmedSessionId}`,
    },
    timeout: 10000,
  });
}

