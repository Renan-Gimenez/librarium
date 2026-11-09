import { openai, prisma } from "@/lib";
import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

export const bookInputSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  description: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  genreSlugs: z.array(z.string()).default([]),
  rating: z.number().nullable().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
});

export const updateBookInputSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  genreSlugs: z.array(z.string()).optional(),
  rating: z.number().nullable().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
});

export type BookInput = z.infer<typeof bookInputSchema>;
export type UpdateBookInput = z.infer<typeof updateBookInputSchema>;

export const listBooksQuerySchema = z.object({
  search: z.string().trim().optional(),
  title: z.string().trim().optional(),
  author: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sortBy: z
    .enum(["title", "author", "rating", "publishedAt", "createdAt"])
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;

const buildSearchableText = (book: {
  title: string;
  author: string;
  description: string | null;
  genres?: { name: string }[] | string[];
}) => {
  const genresStr = book.genres?.length
    ? book.genres
        .map((g) => (typeof g === "string" ? g : g.name))
        .join(", ")
    : null;

  return [
    `Título: ${book.title}`,
    `Autor: ${book.author}`,
    genresStr ? `Gêneros: ${genresStr}` : null,
    `Descrição: ${book.description ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n");
};

export const generateEmbedding = async (searchableText: string) => {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: searchableText,
  });

  const embedding = response.data[0]?.embedding;

  if (!embedding) {
    throw new Error("Failed to generate embedding");
  }

  return embedding;
};

export const saveBookEmbedding = async (
  bookId: string,
  embedding: number[],
) => {
  const vector = `[${embedding.join(",")}]`;

  await prisma.$executeRaw`
    UPDATE "books"
    SET "embedding" = ${vector}::vector
    WHERE "id" = ${bookId}
  `;
};

export const listBooks = async (query: ListBooksQuery) => {
  const {
    search,
    title,
    author,
    genre,
    minRating,
    page,
    limit,
    sortBy,
    order,
  } = query;

  const whereConditions: Prisma.BookWhereInput[] = [];

  if (search) {
    whereConditions.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { author: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (title) {
    whereConditions.push({
      title: { contains: title, mode: "insensitive" },
    });
  }

  if (author) {
    whereConditions.push({
      author: { contains: author, mode: "insensitive" },
    });
  }

  if (genre) {
    whereConditions.push({
      genres: {
        some: {
          slug: { equals: genre, mode: "insensitive" },
        },
      },
    });
  }

  if (minRating !== undefined) {
    whereConditions.push({
      rating: { gte: minRating },
    });
  }

  const where: Prisma.BookWhereInput =
    whereConditions.length > 0 ? { AND: whereConditions } : {};

  const skip = (page - 1) * limit;

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      include: {
        genres: true,
      },
      orderBy: {
        [sortBy]: order,
      },
      skip,
      take: limit,
    }),
    prisma.book.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    books,
    meta: {
      total,
      page,
      limit,
      totalPages,
    },
  };
};

export const createBook = async (input: BookInput) => {
  const { genreSlugs = [], ...data } = input;

  if (genreSlugs.length > 0) {
    const existingGenres = await prisma.genre.findMany({
      where: { slug: { in: genreSlugs } },
    });

    if (existingGenres.length !== genreSlugs.length) {
      const foundSlugs = new Set(existingGenres.map((g) => g.slug));
      const missing = genreSlugs.filter((s) => !foundSlugs.has(s));
      throw new Error(`Genre(s) not found: ${missing.join(", ")}`);
    }
  }

  const existingGenres = genreSlugs.length
    ? await prisma.genre.findMany({
        where: { slug: { in: genreSlugs } },
      })
    : [];

  const searchableText = buildSearchableText({
    ...data,
    description: data.description ?? null,
    genres: existingGenres,
  });

  const embedding = await generateEmbedding(searchableText);

  const book = await prisma.book.create({
    data: {
      title: data.title,
      author: data.author,
      description: data.description ?? null,
      coverUrl: data.coverUrl ?? null,
      rating: data.rating ?? null,
      publishedAt: data.publishedAt ?? null,
      genres: {
        connect: genreSlugs.map((slug) => ({ slug })),
      },
    },
    include: {
      genres: true,
    },
  });

  await saveBookEmbedding(book.id, embedding);

  return book;
};

export const updateBook = async (id: string, input: UpdateBookInput) => {
  const existingBook = await prisma.book.findUnique({
    where: { id },
    include: { genres: true },
  });

  if (!existingBook) {
    return null;
  }

  const { genreSlugs, ...data } = input;

  let genresToConnect = existingBook.genres;
  if (genreSlugs !== undefined) {
    if (genreSlugs.length > 0) {
      const existingGenres = await prisma.genre.findMany({
        where: { slug: { in: genreSlugs } },
      });

      if (existingGenres.length !== genreSlugs.length) {
        const foundSlugs = new Set(existingGenres.map((g) => g.slug));
        const missing = genreSlugs.filter((s) => !foundSlugs.has(s));
        throw new Error(`Genre(s) not found: ${missing.join(", ")}`);
      }
      genresToConnect = existingGenres;
    } else {
      genresToConnect = [];
    }
  }

  const newTitle = data.title ?? existingBook.title;
  const newAuthor = data.author ?? existingBook.author;
  const newDescription =
    data.description !== undefined ? data.description : existingBook.description;

  const searchableText = buildSearchableText({
    title: newTitle,
    author: newAuthor,
    description: newDescription,
    genres: genresToConnect,
  });

  const embedding = await generateEmbedding(searchableText);

  const updatedBook = await prisma.book.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.author !== undefined && { author: data.author }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.coverUrl !== undefined && { coverUrl: data.coverUrl }),
      ...(data.rating !== undefined && { rating: data.rating }),
      ...(data.publishedAt !== undefined && { publishedAt: data.publishedAt }),
      ...(genreSlugs !== undefined && {
        genres: {
          set: genreSlugs.map((slug) => ({ slug })),
        },
      }),
    },
    include: {
      genres: true,
    },
  });

  await saveBookEmbedding(id, embedding);

  return updatedBook;
};

export const deleteBook = async (id: string) => {
  const existingBook = await prisma.book.findUnique({
    where: { id },
  });

  if (!existingBook) {
    return false;
  }

  await prisma.book.delete({
    where: { id },
  });

  return true;
};

export const reindexBooks = async (mode: "missing" | "all" = "missing") => {
  type BookWithGenres = {
    id: string;
    title: string;
    author: string;
    description: string | null;
    genres: { slug: string; name: string }[];
  };

  const books: BookWithGenres[] =
    mode === "missing"
      ? await prisma.$queryRaw<BookWithGenres[]>`
          SELECT
            b."id",
            b."title",
            b."author",
            b."description",
            COALESCE(
              json_agg(
                json_build_object('slug', g."slug", 'name', g."name")
              ) FILTER (WHERE g."slug" IS NOT NULL),
              '[]'::json
            ) AS "genres"
          FROM "books" b
          LEFT JOIN "_BookToGenre" bg ON b."id" = bg."A"
          LEFT JOIN "genres" g ON bg."B" = g."slug"
          WHERE b."embedding" IS NULL
          GROUP BY b."id"
        `
      : await prisma.book.findMany({
          select: {
            id: true,
            title: true,
            author: true,
            description: true,
            genres: {
              select: {
                slug: true,
                name: true,
              },
            },
          },
        });

  for (const book of books) {
    const searchableText = buildSearchableText(book);
    const embedding = await generateEmbedding(searchableText);
    await saveBookEmbedding(book.id, embedding);
  }

  return books.length;
};

export async function searchSimilarBooks(query: string, limit = 5) {
  const queryEmbedding = await generateEmbedding(query);

  return findSimilarBooks(queryEmbedding, limit);
}

type SimilarBook = {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  rating: number | null;
  publishedAt: Date | null;
  genres: { slug: string; name: string }[];
  createdAt: Date;
  similarity: number;
};

export async function findSimilarBooks(
  embedding: number[],
  limit = 5,
): Promise<SimilarBook[]> {
  const vector = `[${embedding.join(",")}]`;

  return prisma.$queryRaw<SimilarBook[]>`
    SELECT
      b."id",
      b."title",
      b."author",
      b."description",
      b."coverUrl",
      b."rating",
      b."publishedAt",
      b."createdAt",
      COALESCE(
        json_agg(
          json_build_object('slug', g."slug", 'name', g."name")
        ) FILTER (WHERE g."slug" IS NOT NULL),
        '[]'::json
      ) AS "genres",
      (
        1 - (b."embedding" <=> ${vector}::vector)
      )::double precision AS similarity
    FROM "books" b
    LEFT JOIN "_BookToGenre" bg ON b."id" = bg."A"
    LEFT JOIN "genres" g ON bg."B" = g."slug"
    WHERE b."embedding" IS NOT NULL
    GROUP BY b."id"
    ORDER BY b."embedding" <=> ${vector}::vector
    LIMIT ${limit}
  `;
}
