import { fastify } from "fastify";
import {
  validatorCompiler,
  serializerCompiler,
  type ZodTypeProvider,
  jsonSchemaTransform,
} from "fastify-type-provider-zod";

import fastifySwagger from "@fastify/swagger";
import fastifyApiReference from "@scalar/fastify-api-reference";

import { booksRoutes } from "@/modules/book/book.routes";
import { chatRoutes } from "@/modules/chat/chat.routes";

export const app = fastify({
  routerOptions: {
    ignoreTrailingSlash: true,
  },
}).withTypeProvider<ZodTypeProvider>();

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Librarium API",
      description: "API for managing books and chat assistant interactions",
      version: "1.0.0",
    },
  },
  transform: jsonSchemaTransform,
});

app.register(fastifyApiReference, {
  routePrefix: "/docs",
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(booksRoutes, { prefix: "/books" });
app.register(chatRoutes, { prefix: "/chat" });
