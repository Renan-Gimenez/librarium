import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { prisma } from "@/lib/prisma";

export const GenreSchema = z.object({
  slug: z.string(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const genresRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    {
      schema: {
        tags: ["Genres"],
        response: {
          200: z.object({
            data: z.array(GenreSchema),
          }),
        },
      },
    },
    async (req, res) => {
      const genres = await prisma.genre.findMany({
        orderBy: {
          name: "asc",
        },
      });

      return { data: genres };
    },
  );

  app.post(
    "/",
    {
      schema: {
        tags: ["Genres"],
        body: z.object({
          slug: z
            .string()
            .trim()
            .min(1, "Slug is required")
            .regex(
              /^[a-z0-9-]+$/,
              "Slug must contain only lowercase letters, numbers, and hyphens",
            ),
          name: z.string().trim().min(1, "Name is required"),
        }),
        response: {
          201: z.object({
            data: GenreSchema,
          }),
          409: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (req, res) => {
      const { slug, name } = req.body;

      const existingGenre = await prisma.genre.findUnique({
        where: { slug },
      });

      if (existingGenre) {
        res.status(409);
        return { message: `Genre with slug "${slug}" already exists.` };
      }

      const genre = await prisma.genre.create({
        data: {
          slug,
          name,
        },
      });

      res.status(201);
      return { data: genre };
    },
  );

  app.get(
    "/:slug",
    {
      schema: {
        tags: ["Genres"],
        params: z.object({
          slug: z.string(),
        }),
        response: {
          200: z.object({
            data: GenreSchema,
          }),
          404: z.object({
            data: z.null(),
          }),
        },
      },
    },
    async (req, res) => {
      const { slug } = req.params;

      const genre = await prisma.genre.findUnique({
        where: { slug },
      });

      if (!genre) {
        res.status(404);
        return { data: null };
      }

      return { data: genre };
    },
  );

  app.put(
    "/:slug",
    {
      schema: {
        tags: ["Genres"],
        params: z.object({
          slug: z.string(),
        }),
        body: z.object({
          name: z.string().trim().min(1, "Name is required"),
        }),
        response: {
          200: z.object({
            data: GenreSchema,
          }),
          404: z.object({
            data: z.null(),
          }),
        },
      },
    },
    async (req, res) => {
      const { slug } = req.params;
      const { name } = req.body;

      const existingGenre = await prisma.genre.findUnique({
        where: { slug },
      });

      if (!existingGenre) {
        res.status(404);
        return { data: null };
      }

      const updatedGenre = await prisma.genre.update({
        where: { slug },
        data: { name },
      });

      return { data: updatedGenre };
    },
  );

  app.delete(
    "/:slug",
    {
      schema: {
        tags: ["Genres"],
        params: z.object({
          slug: z.string(),
        }),
        response: {
          200: z.object({
            message: z.string(),
          }),
          404: z.object({
            data: z.null(),
          }),
        },
      },
    },
    async (req, res) => {
      const { slug } = req.params;

      const existingGenre = await prisma.genre.findUnique({
        where: { slug },
      });

      if (!existingGenre) {
        res.status(404);
        return { data: null };
      }

      await prisma.genre.delete({
        where: { slug },
      });

      return { message: `Genre "${slug}" deleted successfully.` };
    },
  );
};

