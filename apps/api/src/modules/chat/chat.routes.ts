import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { env } from "@/config/env";
import { authMiddleware } from "@/middlewares/auth.middleware";

import { processChatMessage } from "./chat.service";

export interface ChatRoutesOptions {
  processMessage?: typeof processChatMessage;
}

export const chatRoutes: FastifyPluginAsyncZod<ChatRoutesOptions> = async (
  app,
  opts,
) => {
  const handleMessage = opts.processMessage ?? processChatMessage;

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
        body: z.object({
          message: z.string().trim().min(1, "Message cannot be empty."),
        }),
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
        },
      },
    },
    async (req, res) => {
      const token = req.token!;
      const { message } = req.body;

      const result = await handleMessage({ token, message });

      res.status(200);
      return result;
    },
  );
};
