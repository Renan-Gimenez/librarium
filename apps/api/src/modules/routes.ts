import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { booksRoutes } from "./book/book.routes";
import { chatRoutes } from "./chat/chat.routes";
import { genresRoutes } from "./genre/genre.routes";

export const appRoutes: FastifyPluginAsyncZod = async (app) => {
  app.register(booksRoutes, { prefix: "/books" });
  app.register(chatRoutes, { prefix: "/chat" });
  app.register(genresRoutes, { prefix: "/genres" });
};
