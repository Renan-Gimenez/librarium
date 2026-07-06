import { fastify } from "fastify";
import {
  validatorCompiler,
  serializerCompiler,
  type ZodTypeProvider,
  jsonSchemaTransform,
} from "fastify-type-provider-zod";

import fastifySwagger from "@fastify/swagger";
import fastifyApiReference from "@scalar/fastify-api-reference";

import { booksRoutes } from "./routes";

export const app = fastify({
  routerOptions: {
    ignoreTrailingSlash: true,
  },
}).withTypeProvider<ZodTypeProvider>();

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Librarium API",
      description: "API para gerenciamento de livros",
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
