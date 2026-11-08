import { fastify } from "fastify";
import {
  validatorCompiler,
  serializerCompiler,
  type ZodTypeProvider,
  jsonSchemaTransform,
} from "fastify-type-provider-zod";

import fastifySwagger from "@fastify/swagger";
import fastifyApiReference from "@scalar/fastify-api-reference";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";

import { env } from "@/config/env";
import { errorHandler } from "@/errors";
import { redis } from "@/lib/redis";
import { appRoutes } from "@/modules/routes";

export const app = fastify({
  routerOptions: {
    ignoreTrailingSlash: true,
  },
}).withTypeProvider<ZodTypeProvider>();

app.register(fastifyCors, {
  origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((o) => o.trim()),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
});

app.register(fastifyRateLimit, {
  redis,
  global: true,
  max: env.RATE_LIMIT_GLOBAL_MAX,
  timeWindow: "1 minute",
  errorResponseBuilder: (_req, context) => ({
    statusCode: 429,
    error: "Too Many Requests",
    message: `Rate limit exceeded. Try again in ${context.after}.`,
  }),
});

if (env.NODE_ENV !== "production") {
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Librarium API",
        description: "API for managing books and chat assistant interactions",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "Insira sua API key no formato: Bearer <token>",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  app.register(fastifyApiReference, {
    routePrefix: "/docs",
  });
}

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.setErrorHandler(errorHandler);

app.decorateRequest("token", null);

app.register(appRoutes, { prefix: "/api" });
