import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { prisma } from "@/lib/prisma";
import { GenreSchema } from "@/modules/genre/genre.routes";

import { bookInputSchema, createBook, reindexBooks } from "./book.service";

export const BookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  genres: z.array(GenreSchema),
  rating: z.number().nullable(),
  publishedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const booksRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    {
      schema: {
        tags: ["Books"],
        response: {
          200: z.object({
            data: z.array(BookSchema),
          }),
        },
      },
    },
    async (req, res) => {
      const books = await prisma.book.findMany({
        include: {
          genres: true,
        },
      });

      return { data: books };
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        tags: ["Books"],
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: z.object({
            data: BookSchema,
          }),
          404: z.object({
            data: z.null(),
          }),
        },
      },
    },
    async (req, res) => {
      const { id } = req.params;

      const book = await prisma.book.findUnique({
        where: {
          id,
        },
        include: {
          genres: true,
        },
      });

      if (!book) {
        res.status(404);
        return { data: null };
      }

      return { data: book };
    },
  );

  app.post(
    "/",
    {
      schema: {
        tags: ["Books"],
        body: bookInputSchema,
        response: {
          201: z.object({
            data: BookSchema,
          }),
        },
      },
    },
    async (req, res) => {
      const book = await createBook(req.body);

      res.status(201);
      return { data: book };
    },
  );

  app.post(
    "/reindex",
    {
      schema: {
        tags: ["Books"],
        body: z.object({
          mode: z.enum(["missing", "all"]).default("missing"),
        }),
        response: {
          200: z.object({
            data: z.object({
              mode: z.enum(["missing", "all"]),
              reindexed: z.number(),
            }),
          }),
        },
      },
    },
    async (req, res) => {
      const { mode } = req.body;

      const reindexed = await reindexBooks(mode);

      return { data: { mode, reindexed } };
    },
  );
};
