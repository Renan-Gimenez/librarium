import { createHash, timingSafeEqual } from "node:crypto";
import type { onRequestHookHandler } from "fastify";

import { env } from "@/config/env";

/** Compares a received header value against the expected Admin API Key via SHA-256 + timingSafeEqual. */
export const verifyAdminApiKey = (
  received: unknown,
  expected: string = env.ADMIN_API_KEY,
): boolean => {
  if (typeof received !== "string" || received.length === 0) {
    return false;
  }

  if (typeof expected !== "string" || expected.length === 0) {
    return false;
  }

  const receivedDigest = createHash("sha256").update(received, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();

  return timingSafeEqual(receivedDigest, expectedDigest);
};

/** Creates a Fastify onRequest hook middleware enforcing X-Admin-Key against the configured secret. */
export const createAdminAuthMiddleware =
  (expectedKey?: string): onRequestHookHandler =>
  (req, res, done) => {
    const received = req.headers["x-admin-key"];

    if (!verifyAdminApiKey(received, expectedKey ?? env.ADMIN_API_KEY)) {
      res.status(401).send({
        message: "Invalid Admin API Key",
      });
      return;
    }

    done();
  };

export const adminAuthMiddleware = createAdminAuthMiddleware();
