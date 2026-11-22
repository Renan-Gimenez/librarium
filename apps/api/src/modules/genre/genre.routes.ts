import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { prisma } from "@/lib/prisma";
import { adminAuthMiddleware } from "@/middlewares/admin-auth.middleware";

export const GenreSchema = z.object({
  slug: z.string(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type GenreRecord = z.infer<typeof GenreSchema>;

export interface GenreRoutesOptions {
  prisma?: {
    genre: {
      findMany: (args: { orderBy: { name: "asc" } }) => Promise<GenreRecord[]>;
      findUnique: (args: {
        where: { slug: string };
      }) => Promise<GenreRecord | null>;
      create: (args: {
        data: { slug: string; name: string };
      }) => Promise<GenreRecord>;
      update: (args: {
        where: { slug: string };
        data: { name: string };
      }) => Promise<GenreRecord>;
      delete: (args: { where: { slug: string } }) => Promise<GenreRecord>;
    };
  };
}

const unauthorizedResponseSchema = z.object({
  message: z.string(),
});

export const genresRoutes: FastifyPluginAsyncZod<GenreRoutesOptions> = async (
  app,
  opts,
) => {
  const db = opts.prisma ?? prisma;

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
      const genres = await db.genre.findMany({
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
      onRequest: [adminAuthMiddleware],
      schema: {
        tags: ["Genres"],
        security: [{ adminApiKey: [] }],
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
          401: unauthorizedResponseSchema,
          409: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (req, res) => {
      const { slug, name } = req.body;

      const existingGenre = await db.genre.findUnique({
        where: { slug },
      });

      if (existingGenre) {
        res.status(409);
        return { message: `Genre with slug "${slug}" already exists.` };
      }

      const genre = await db.genre.create({
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

      const genre = await db.genre.findUnique({
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
      onRequest: [adminAuthMiddleware],
      schema: {
        tags: ["Genres"],
        security: [{ adminApiKey: [] }],
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
          401: unauthorizedResponseSchema,
          404: z.object({
            data: z.null(),
          }),
        },
      },
    },
    async (req, res) => {
      const { slug } = req.params;
      const { name } = req.body;

      const existingGenre = await db.genre.findUnique({
        where: { slug },
      });

      if (!existingGenre) {
        res.status(404);
        return { data: null };
      }

      const updatedGenre = await db.genre.update({
        where: { slug },
        data: { name },
      });

      return { data: updatedGenre };
    },
  );

  app.delete(
    "/:slug",
    {
      onRequest: [adminAuthMiddleware],
      schema: {
        tags: ["Genres"],
        security: [{ adminApiKey: [] }],
        params: z.object({
          slug: z.string(),
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
      const { slug } = req.params;

      const existingGenre = await db.genre.findUnique({
        where: { slug },
      });

      if (!existingGenre) {
        res.status(404);
        return { data: null };
      }

      await db.genre.delete({
        where: { slug },
      });

      return { message: `Genre "${slug}" deleted successfully.` };
    },
  );
};

