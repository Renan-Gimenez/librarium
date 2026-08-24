import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default("0.0.0.0"),
  OPENAI_API_KEY: z.string().min(1),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  CHAT_SESSION_TTL: z.coerce.number().default(3600),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export const env = envSchema.parse(process.env);
