import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { env } from "@/config/env";
import { openai, redis } from "@/lib";
import { authMiddleware } from "@/middlewares/auth.middleware";

import { SYSTEM_PROMPT } from "./chat.prompts";
import { searchSimilarBooks } from "../book/book.service";

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
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
                        })
                      )
                      .optional(),
                    similarity: z.number().optional(),
                  })
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
      const token = req.token;
      const { message } = req.body;

      const redisKey = `chat:session:${token}:messages`;

      const cachedHistory = await redis.get(redisKey);

      interface ChatMessage {
        id: string;
        role: "user" | "assistant";
        content: string;
        createdAt: string;
      }

      const messageHistory: ChatMessage[] = cachedHistory
        ? JSON.parse(cachedHistory)
        : [];

      const relevantBooks = await searchSimilarBooks(message, 3);

      const booksContext =
        relevantBooks.length > 0
          ? relevantBooks
              .map((book) => {
                const genres = book.genres?.map((g) => g.name).join(", ");
                const dateStr = book.createdAt
                  ? new Date(book.createdAt).toISOString()
                  : null;
                return `- Título: "${book.title}"\n  Autor: ${book.author}${genres ? `\n  Gêneros: ${genres}` : ""}${dateStr ? `\n  Cadastrado no catálogo em: ${dateStr}` : ""}\n  Sinopse: ${book.description ?? "Sem descrição"}\n  Similaridade semântica: ${(book.similarity * 100).toFixed(1)}%`;
              })
              .join("\n\n")
          : "Nenhum livro relevante encontrado no acervo.";

      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\n### Obras do acervo relacionadas à consulta:\n${booksContext}`,
        },
        ...messageHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        {
          role: "user",
          content: message,
        },
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_completion_tokens: 600,
        presence_penalty: 0.2,
        frequency_penalty: 0.3,
        user: token!,
        messages,
      });

      const usage = response.usage;
      const choice = response.choices[0];

      const modelReply = choice?.message.content ?? "";

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      };

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: modelReply,
        createdAt: new Date().toISOString(),
      };

      const updatedHistory = [...messageHistory, userMessage, assistantMessage];

      await redis.set(redisKey, JSON.stringify(updatedHistory));
      await redis.expire(redisKey, env.CHAT_SESSION_TTL);

      const citedBooks = relevantBooks
        .filter((b) => {
          const normReply = modelReply.toLowerCase();
          const normTitle = b.title.toLowerCase();
          const hasWordMatch =
            normTitle.length >= 3 &&
            new RegExp(
              `\\b${normTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
              "i"
            ).test(normReply);
          return hasWordMatch || b.similarity >= 0.7;
        })
        .map((b) => ({
          id: b.id,
          title: b.title,
          author: b.author,
          description: b.description,
          coverUrl: b.coverUrl,
          rating:
            b.rating !== null && b.rating !== undefined
              ? Number(b.rating)
              : null,
          publishedAt: b.publishedAt
            ? new Date(b.publishedAt).toISOString()
            : null,
          genres: b.genres,
          similarity: Math.round(b.similarity * 100),
        }));

      res.status(200);
      return {
        data: {
          userMessage: message,
          modelReply,
          books: citedBooks,
        },
        meta: {
          usage: {
            promptTokens: usage?.prompt_tokens ?? 0,
            completionTokens: usage?.completion_tokens ?? 0,
            totalTokens: usage?.total_tokens ?? 0,
          },
        },
      };
    },
  );
};
