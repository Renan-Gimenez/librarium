import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { prisma } from "@/lib/prisma";
import { adminAuthMiddleware } from "@/middlewares/admin-auth.middleware";
import { GenreSchema } from "@/modules/genre/genre.routes";

import {
  bookInputSchema,
  createBook,
  deleteBook,
  listBooks,
  listBooksQuerySchema,
  reindexBooks,
  updateBook,
  updateBookInputSchema,
  type BookWithGenres,
} from "./book.service";

export interface BookRoutesOptions {
  listBooks?: typeof listBooks;
  findBookById?: (id: string) => Promise<BookWithGenres | null>;
  createBook?: typeof createBook;
  updateBook?: typeof updateBook;
  deleteBook?: typeof deleteBook;
  reindexBooks?: typeof reindexBooks;
}

const unauthorizedResponseSchema = z.object({
  message: z.string(),
});

export const PaginationMetaSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

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

export const booksRoutes: FastifyPluginAsyncZod<BookRoutesOptions> = async (
  app,
  opts,
) => {
  const handleListBooks = opts.listBooks ?? listBooks;
  const handleFindBookById =
    opts.findBookById ??
    ((id: string) =>
      prisma.book.findUnique({
        where: { id },
        include: { genres: true },
      }));
  const handleCreateBook = opts.createBook ?? createBook;
  const handleUpdateBook = opts.updateBook ?? updateBook;
  const handleDeleteBook = opts.deleteBook ?? deleteBook;
  const handleReindexBooks = opts.reindexBooks ?? reindexBooks;

  app.get(
    "/",
    {
      schema: {
        tags: ["Books"],
        querystring: listBooksQuerySchema,
        response: {
          200: z.object({
            data: z.array(BookSchema),
            meta: PaginationMetaSchema,
          }),
        },
      },
    },
    async (req, res) => {
      const { books, meta } = await handleListBooks(req.query);

      return { data: books, meta };
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

      const book = await handleFindBookById(id);

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
      onRequest: [adminAuthMiddleware],
      schema: {
        tags: ["Books"],
        security: [{ adminApiKey: [] }],
        body: bookInputSchema,
        response: {
          201: z.object({
            data: BookSchema,
          }),
          401: unauthorizedResponseSchema,
        },
      },
    },
    async (req, res) => {
      const book = await handleCreateBook(req.body);

      res.status(201);
      return { data: book };
    },
  );

  app.put(
    "/:id",
    {
      onRequest: [adminAuthMiddleware],
      schema: {
        tags: ["Books"],
        security: [{ adminApiKey: [] }],
        params: z.object({
          id: z.string(),
        }),
        body: updateBookInputSchema,
        response: {
          200: z.object({
            data: BookSchema,
          }),
          401: unauthorizedResponseSchema,
          404: z.object({
            data: z.null(),
          }),
        },
      },
    },
    async (req, res) => {
      const { id } = req.params;

      const book = await handleUpdateBook(id, req.body);

      if (!book) {
        res.status(404);
        return { data: null };
      }

      return { data: book };
    },
  );

  app.delete(
    "/:id",
    {
      onRequest: [adminAuthMiddleware],
      schema: {
        tags: ["Books"],
        security: [{ adminApiKey: [] }],
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: z.object({
            message: z.string(),
          }),
          401: unauthorizedResponseSchema,
          404: z.object({
            data: z.null(),
          }),
        },
      },
    },
    async (req, res) => {
      const { id } = req.params;

      const deleted = await handleDeleteBook(id);

      if (!deleted) {
        res.status(404);
        return { data: null };
      }

      return { message: `Book "${id}" deleted successfully.` };
    },
  );

  app.post(
    "/reindex",
    {
      onRequest: [adminAuthMiddleware],
      schema: {
        tags: ["Books"],
        security: [{ adminApiKey: [] }],
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
          401: unauthorizedResponseSchema,
        },
      },
    },
    async (req, res) => {
      const { mode } = req.body;

      const reindexed = await handleReindexBooks(mode);

      return { data: { mode, reindexed } };
    },
  );
};
