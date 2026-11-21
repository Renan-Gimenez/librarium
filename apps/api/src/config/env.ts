import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default("0.0.0.0"),
  OPENAI_API_KEY: z.string().min(1),
  ADMIN_API_KEY: z
    .string()
    .refine(
      (v) => v.trim().length > 0 && v === v.trim(),
      "ADMIN_API_KEY must be a non-empty string without leading or trailing whitespace",
    ),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  CHAT_SESSION_TTL: z.coerce.number().default(3600),
  CORS_ORIGIN: z.string().default("*"),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().default(100),
  RATE_LIMIT_CHAT_MAX: z.coerce.number().default(15),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export const env = envSchema.parse(process.env);
