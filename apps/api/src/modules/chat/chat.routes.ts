import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { env } from "@/config/env";
import { AppError } from "@/errors";
import { authMiddleware } from "@/middlewares/auth.middleware";

import { processChatMessage, streamChatMessage } from "./chat.service";

export interface ChatRoutesOptions {
  processMessage?: typeof processChatMessage;
  streamMessage?: typeof streamChatMessage;
}

const chatMessageBodySchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(2000, "Message cannot exceed 2000 characters."),
});

const chatErrorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});

function writeSseEvent(
  rawRes: FastifyReply["raw"],
  event: "delta" | "done" | "error",
  payload: unknown,
): void {
  if (!rawRes.writable || rawRes.writableEnded || rawRes.destroyed) {
    return;
  }

  try {
    rawRes.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  } catch {
    rawRes.destroy();
  }
}

export function extractStreamErrorMessage(
  err: unknown,
  isProduction = env.NODE_ENV === "production",
): string {
  if (err instanceof AppError) {
    return err.message;
  }

  if (!isProduction && err instanceof Error && err.message) {
    return err.message;
  }

  return "Ocorreu um erro ao processar a resposta do assistente.";
}

function getBunHttpHandle(
  rawRes: FastifyReply["raw"],
): { aborted?: boolean } | null {
  const handleSym = Object.getOwnPropertySymbols(rawRes).find(
    (sym) => sym.description === "handle",
  );
  if (!handleSym) {
    return null;
  }

  const handle = (rawRes as unknown as Record<symbol, unknown>)[handleSym];
  if (typeof handle === "object" && handle !== null && "aborted" in handle) {
    return handle as { aborted?: boolean };
  }

  return null;
}

function watchResponseDisconnect(
  rawRes: FastifyReply["raw"],
  abortController: AbortController,
): () => void {
  const bunHandle = getBunHttpHandle(rawRes);

  if (rawRes.destroyed || rawRes.closed || bunHandle?.aborted) {
    abortController.abort();
    return () => {};
  }

  let abortWatcher: ReturnType<typeof setInterval> | undefined;

  const clearWatcher = () => {
    if (abortWatcher !== undefined) {
      clearInterval(abortWatcher);
      abortWatcher = undefined;
    }
  };

  const onClose = () => {
    clearWatcher();
    if (!rawRes.writableEnded) {
      abortController.abort();
    }
  };

  const onError = () => {
    clearWatcher();
    abortController.abort();
  };

  rawRes.on("close", onClose);
  rawRes.on("error", onError);

  // Bun's node:http ServerResponse sets handle.aborted=true on POST client disconnect
  // without reliably emitting "close" on res.raw until res.raw.end() is called.
  if (bunHandle) {
    abortWatcher = setInterval(() => {
      if (bunHandle.aborted && !rawRes.writableEnded) {
        clearWatcher();
        abortController.abort();
      }
    }, 25);
    abortWatcher.unref?.();
  }

  return () => {
    rawRes.off?.("close", onClose);
    rawRes.off?.("error", onError);
    clearWatcher();
  };
}

export const chatRoutes: FastifyPluginAsyncZod<ChatRoutesOptions> = async (
  app,
  opts,
) => {
  const handleMessage = opts.processMessage ?? processChatMessage;
  const handleStreamMessage = opts.streamMessage ?? streamChatMessage;

  app.addHook("preHandler", authMiddleware);

  app.post(
    "/",
    {
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_CHAT_MAX,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["Chat"],
        description:
          "Endpoint responsible for receiving a user message and returning the LLM response, incorporating the chat message history stored in Redis.",
        security: [
          {
            bearerAuth: [],
          },
        ],
        body: chatMessageBodySchema,
        response: {
          200: z.object({
            data: z.object({
              userMessage: z.string(),
              modelReply: z.string(),
              books: z
                .array(
                  z.object({
                    id: z.string(),
                    title: z.string(),
                    author: z.string(),
                    description: z.string().nullable().optional(),
                    coverUrl: z.string().nullable().optional(),
                    rating: z.number().nullable().optional(),
                    publishedAt: z.string().nullable().optional(),
                    genres: z
                      .array(
                        z.object({
                          slug: z.string(),
                          name: z.string(),
                        }),
                      )
                      .optional(),
                    similarity: z.number().optional(),
                  }),
                )
                .optional(),
            }),
            meta: z.object({
              usage: z.object({
                promptTokens: z.number(),
                completionTokens: z.number(),
                totalTokens: z.number(),
              }),
            }),
          }),
          409: chatErrorResponseSchema,
        },
      },
    },
    async (req, res) => {
      const token = req.token!;
      const { message } = req.body;

      const result = await handleMessage({ token, message, logger: req.log });

      res.status(200);
      return result;
    },
  );

  app.post(
    "/stream",
    {
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_CHAT_MAX,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["Chat"],
        summary: "Stream AI chat response via Server-Sent Events (SSE)",
        description:
          "Receives a user message and streams assistant tokens in real time via Server-Sent Events (delta, done, error), executing tool calling against the catalog and storing finalized turns in Redis.",
        security: [
          {
            bearerAuth: [],
          },
        ],
        body: chatMessageBodySchema,
        response: {
          200: z
            .string()
            .describe(
              "Server-Sent Events stream emitting delta, done, and error events.",
            ),
          409: chatErrorResponseSchema,
        },
      },
    },
    async (req, res) => {
      const token = req.token!;
      const { message } = req.body;

      const abortController = new AbortController();
      let stopWatchingDisconnect: (() => void) | undefined;
      let streamStarted = false;

      const ensureStreamStarted = () => {
        if (streamStarted) {
          return;
        }
        streamStarted = true;
        res.hijack();

        const sseHeaders: Record<string, string | number | string[]> = {};
        for (const [key, value] of Object.entries(res.getHeaders())) {
          if (value !== undefined) {
            sseHeaders[key.toLowerCase()] = value;
          }
        }

        delete sseHeaders["content-length"];
        sseHeaders["content-type"] = "text/event-stream; charset=utf-8";
        sseHeaders["cache-control"] = "no-cache, no-transform";
        sseHeaders["connection"] = "keep-alive";
        sseHeaders["x-accel-buffering"] = "no";

        res.raw.writeHead(200, sseHeaders);
        res.raw.flushHeaders?.();
      };

      try {
        stopWatchingDisconnect = watchResponseDisconnect(
          res.raw,
          abortController,
        );
        if (abortController.signal.aborted) {
          return;
        }

        const result = await handleStreamMessage({
          token,
          message,
          logger: req.log,
          signal: abortController.signal,
          onStreamStart: () => {
            if (!abortController.signal.aborted) {
              ensureStreamStarted();
            }
          },
          onDelta: (content) => {
            if (abortController.signal.aborted) {
              return;
            }
            ensureStreamStarted();
            writeSseEvent(res.raw, "delta", { content });
          },
        });

        if (!abortController.signal.aborted) {
          ensureStreamStarted();
          writeSseEvent(res.raw, "done", result);
        }
      } catch (err) {
        if (!streamStarted && err instanceof AppError && err.statusCode === 409) {
          throw err;
        }
        if (!abortController.signal.aborted) {
          ensureStreamStarted();
          req.log.error(err);
          writeSseEvent(res.raw, "error", {
            message: extractStreamErrorMessage(err),
          });
        }
      } finally {
        stopWatchingDisconnect?.();
        if (streamStarted && !res.raw.writableEnded) {
          res.raw.end();
        } else if (
          !streamStarted &&
          abortController.signal.aborted &&
          !res.sent
        ) {
          res.hijack();
          if (!res.raw.writableEnded) {
            res.raw.end();
          }
        }
      }
    },
  );
};
