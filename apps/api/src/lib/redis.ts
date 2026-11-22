import Redis from "ioredis";

import { env } from "@/config/env";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: process.env.NODE_ENV === "test" || env.NODE_ENV === "test",
});
