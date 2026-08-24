import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { prisma } from "@/lib/prisma";

export const BookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  genreId: z.string(),
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
      const books = await prisma.book.findMany();

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
        body: z.object({
          title: z.string(),
          author: z.string(),
          description: z.string().nullable(),
          coverUrl: z.string().nullable(),
          genreId: z.string(),
          rating: z.number().nullable(),
          publishedAt: z.coerce.date().nullable(),
        }),
        response: {
          201: z.object({
            data: BookSchema,
          }),
        },
      },
    },
    async (req, res) => {
      const {
        title,
        author,
        description,
        coverUrl,
        genreId,
        rating,
        publishedAt,
      } = req.body;

      const book = await prisma.book.create({
        data: {
          title,
          author,
          description,
          coverUrl,
          genreId,
          rating,
          publishedAt,
        },
      });

      res.status(201);
      return { data: book };
    },
  );
};
