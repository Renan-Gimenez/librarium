import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { openai } from "../../lib/openai";
import { redis } from "../../lib/redis";

import { SYSTEM_PROMPT } from "./chat.prompts";
import { env } from "../../../config/env";

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/",
    {
      schema: {
        tags: ["Chat"],
        description:
          "Endpoint responsible for receiving a user message and returning the LLM response, incorporating the chat message history stored in Redis.",
        headers: z.object({
          "x-session-id": z.uuid(),
        }),
        body: z.object({
          message: z.string().trim().min(1, "Message cannot be empty."),
        }),
        response: {
          200: z.object({
            data: z.object({
              userMessage: z.string(),
              modelReply: z.string(),
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
      const sessionId = req.headers["x-session-id"];
      const { message } = req.body;

      const redisKey = `chat:session:${sessionId}:messages`;

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

      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: SYSTEM_PROMPT,
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
        user: sessionId,
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

      res.status(200);
      return {
        data: {
          userMessage: message,
          modelReply,
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
