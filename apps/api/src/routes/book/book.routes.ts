import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { PrismaBooksRepository } from "../../modules/book/repositories/prisma/prisma-books.repository";
import { CreateBookUseCase } from "../../modules/book/use-cases/create-book.use-case";
import { GetBookByIdUseCase } from "../../modules/book/use-cases/get-book-by-id.use-case";
import { ListBooksUseCase } from "../../modules/book/use-cases/list-books.use-case";

export const BookSchema = z.object({
  id: z.uuid(),
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
        querystring: z.object({
          id: z.uuid().optional(),
          title: z.string().optional(),
          author: z.string().optional(),
          description: z.string().optional(),
          coverUrl: z.string().optional(),
          genreId: z.uuid().optional(),
          rating: z.coerce.number().min(0).max(5).optional(),
          publishedAt: z.coerce.date().optional(),
        }),
        response: {
          200: z.object({
            data: z.array(BookSchema),
          }),
        },
      },
    },
    async (req, res) => {
      const booksRepository = new PrismaBooksRepository();
      const listBooksUseCase = new ListBooksUseCase(booksRepository);
      const books = await listBooksUseCase.execute(req.query);

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

      const booksRepository = new PrismaBooksRepository();
      const getBookByIdUseCase = new GetBookByIdUseCase(booksRepository);
      const book = await getBookByIdUseCase.execute(id);

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
      const booksRepository = new PrismaBooksRepository();
      const createBookUseCase = new CreateBookUseCase(booksRepository);
      const book = await createBookUseCase.execute(req.body);

      res.status(201);
      return { data: book };
    },
  );
};
