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
  deps?: {
    prisma?: {
      $executeRaw: (
        query: TemplateStringsArray,
        ...values: unknown[]
      ) => Promise<unknown>;
    };
  },
) => {
  const db = deps?.prisma ?? prisma;
  const vector = `[${embedding.join(",")}]`;

  await db.$executeRaw`
    UPDATE "books"
    SET "embedding" = ${vector}::vector
    WHERE "id" = ${bookId}
  `;
};

export type BookWithGenres = Prisma.BookGetPayload<{
  include: { genres: true };
}>;

export interface ListBooksDeps {
  prisma?: {
    book: {
      findMany: (args: {
        where?: Prisma.BookWhereInput;
        include: { genres: true };
        orderBy?: Prisma.BookOrderByWithRelationInput;
        skip?: number;
        take?: number;
      }) => Promise<BookWithGenres[]>;
      count: (args: { where?: Prisma.BookWhereInput }) => Promise<number>;
    };
  };
}

export const listBooks = async (
  query: ListBooksQuery,
  deps?: ListBooksDeps,
) => {
  const db: NonNullable<ListBooksDeps["prisma"]> = deps?.prisma ?? prisma;
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
          OR: [
            { slug: { equals: genre, mode: "insensitive" } },
            { name: { equals: genre, mode: "insensitive" } },
          ],
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

  const orderBy: Prisma.BookOrderByWithRelationInput =
    sortBy === "rating" || sortBy === "publishedAt"
      ? { [sortBy]: { sort: order, nulls: "last" } }
      : { [sortBy]: order };

  const [books, total] = await Promise.all([
    db.book.findMany({
      where,
      include: {
        genres: true,
      },
      orderBy,
      skip,
      take: limit,
    }),
    db.book.count({ where }),
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

type ExecuteRawClient = {
  $executeRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
};

type GenreRepo = {
  findMany: (args: {
    where: { slug: { in: string[] } };
  }) => Promise<{ slug: string; name: string }[]>;
};

const resolveGenresBySlugs = async (
  genreSlugs: string[],
  genreRepo: GenreRepo,
) => {
  const uniqueGenreSlugs = [...new Set(genreSlugs)];

  if (uniqueGenreSlugs.length === 0) {
    return {
      uniqueGenreSlugs,
      genres: [] as { slug: string; name: string }[],
    };
  }

  const existingGenres = await genreRepo.findMany({
    where: { slug: { in: uniqueGenreSlugs } },
  });

  if (existingGenres.length !== uniqueGenreSlugs.length) {
    const foundSlugs = new Set(existingGenres.map((g) => g.slug));
    const missing = uniqueGenreSlugs.filter((s) => !foundSlugs.has(s));
    throw new Error(`Genre(s) not found: ${missing.join(", ")}`);
  }

  return {
    uniqueGenreSlugs,
    genres: existingGenres,
  };
};

const createEmbeddingPersister = (
  customSave?: typeof saveBookEmbedding,
  fallbackDb?: Partial<ExecuteRawClient>,
) => {
  return (
    bookId: string,
    embedding: number[],
    tx?: Partial<ExecuteRawClient>,
    inTransaction = false,
  ) => {
    if (customSave) {
      return customSave(bookId, embedding);
    }

    if (inTransaction) {
      if (!tx?.$executeRaw) {
        throw new Error("Transaction client must provide $executeRaw");
      }

      return saveBookEmbedding(bookId, embedding, {
        prisma: {
          $executeRaw: tx.$executeRaw.bind(tx),
        },
      });
    }

    const rawClient = tx?.$executeRaw
      ? tx
      : fallbackDb?.$executeRaw
        ? fallbackDb
        : prisma;

    return saveBookEmbedding(bookId, embedding, {
      prisma: {
        $executeRaw: rawClient.$executeRaw!.bind(rawClient),
      },
    });
  };
};

export interface CreateBookTx {
  book: {
    create: (args: {
      data: Prisma.BookCreateInput;
      include: { genres: true };
    }) => Promise<BookWithGenres>;
  };
  $executeRaw?: ExecuteRawClient["$executeRaw"];
}

export interface CreateBookDeps {
  prisma?: {
    book?: CreateBookTx["book"];
    genre: GenreRepo;
    $executeRaw?: ExecuteRawClient["$executeRaw"];
    $transaction?: <T>(fn: (tx: CreateBookTx) => Promise<T>) => Promise<T>;
  };
  generateEmbedding?: typeof generateEmbedding;
  saveBookEmbedding?: typeof saveBookEmbedding;
}

export const createBook = async (
  input: BookInput,
  deps?: CreateBookDeps,
): Promise<BookWithGenres> => {
  const db: NonNullable<CreateBookDeps["prisma"]> = deps?.prisma ?? prisma;
  const genEmbedding = deps?.generateEmbedding ?? generateEmbedding;
  const persistEmbedding = createEmbeddingPersister(
    deps?.saveBookEmbedding,
    db,
  );
  const inTransaction = Boolean(db.$transaction);

  const { genreSlugs = [], ...data } = input;

  const { uniqueGenreSlugs, genres: existingGenres } =
    await resolveGenresBySlugs(genreSlugs, db.genre);

  const searchableText = buildSearchableText({
    ...data,
    description: data.description ?? null,
    genres: existingGenres,
  });

  const embedding = await genEmbedding(searchableText);

  const runCreate = async (tx: CreateBookTx) => {
    const book = await tx.book.create({
      data: {
        title: data.title,
        author: data.author,
        description: data.description ?? null,
        coverUrl: data.coverUrl ?? null,
        rating: data.rating ?? null,
        publishedAt: data.publishedAt ?? null,
        genres: {
          connect: uniqueGenreSlugs.map((slug) => ({ slug })),
        },
      },
      include: {
        genres: true,
      },
    });

    await persistEmbedding(book.id, embedding, tx, inTransaction);

    return book;
  };

  if (db.$transaction) {
    return db.$transaction(runCreate);
  }

  if (!db.book) {
    throw new Error("Prisma book repository or $transaction is required");
  }

  return runCreate({ book: db.book, $executeRaw: db.$executeRaw });
};

export interface UpdateBookTx {
  book: {
    update: (args: {
      where: { id: string };
      data: Prisma.BookUpdateInput;
      include: { genres: true };
    }) => Promise<BookWithGenres>;
  };
  $executeRaw?: ExecuteRawClient["$executeRaw"];
}

export interface UpdateBookDeps {
  prisma?: {
    book: {
      findUnique: (args: {
        where: { id: string };
        include: { genres: true };
      }) => Promise<BookWithGenres | null>;
      update: UpdateBookTx["book"]["update"];
    };
    genre: GenreRepo;
    $executeRaw?: ExecuteRawClient["$executeRaw"];
    $transaction?: <T>(fn: (tx: UpdateBookTx) => Promise<T>) => Promise<T>;
  };
  generateEmbedding?: typeof generateEmbedding;
  saveBookEmbedding?: typeof saveBookEmbedding;
}

const hasIndexableBookChanges = (
  existingBook: {
    title: string;
    author: string;
    description: string | null;
    genres: { slug: string }[];
  },
  input: UpdateBookInput,
): boolean => {
  if (input.title !== undefined && input.title !== existingBook.title) {
    return true;
  }

  if (input.author !== undefined && input.author !== existingBook.author) {
    return true;
  }

  if (
    input.description !== undefined &&
    input.description !== existingBook.description
  ) {
    return true;
  }

  if (input.genreSlugs !== undefined) {
    const existingSlugs = new Set(existingBook.genres.map((g) => g.slug));
    const nextSlugs = new Set(input.genreSlugs);
    if (
      existingSlugs.size !== nextSlugs.size ||
      [...nextSlugs].some((slug) => !existingSlugs.has(slug))
    ) {
      return true;
    }
  }

  return false;
};

export const updateBook = async (
  id: string,
  input: UpdateBookInput,
  deps?: UpdateBookDeps,
): Promise<BookWithGenres | null> => {
  const db: NonNullable<UpdateBookDeps["prisma"]> = deps?.prisma ?? prisma;
  const genEmbedding = deps?.generateEmbedding ?? generateEmbedding;
  const persistEmbedding = createEmbeddingPersister(
    deps?.saveBookEmbedding,
    db,
  );
  const inTransaction = Boolean(db.$transaction);

  const existingBook = await db.book.findUnique({
    where: { id },
    include: { genres: true },
  });

  if (!existingBook) {
    return null;
  }

  const { genreSlugs, ...data } = input;

  let genresToConnect: { slug: string; name: string }[] = existingBook.genres;
  let uniqueGenreSlugs: string[] | undefined;

  if (genreSlugs !== undefined) {
    const resolved = await resolveGenresBySlugs(genreSlugs, db.genre);
    uniqueGenreSlugs = resolved.uniqueGenreSlugs;
    genresToConnect = resolved.genres;
  }

  const shouldRegenerateEmbedding = hasIndexableBookChanges(existingBook, input);

  let embedding: number[] | null = null;
  if (shouldRegenerateEmbedding) {
    const newTitle = data.title ?? existingBook.title;
    const newAuthor = data.author ?? existingBook.author;
    const newDescription =
      data.description !== undefined
        ? data.description
        : existingBook.description;

    const searchableText = buildSearchableText({
      title: newTitle,
      author: newAuthor,
      description: newDescription,
      genres: genresToConnect,
    });

    embedding = await genEmbedding(searchableText);
  }

  const runUpdate = async (tx: UpdateBookTx) => {
    const updatedBook = await tx.book.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.author !== undefined && { author: data.author }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.coverUrl !== undefined && { coverUrl: data.coverUrl }),
        ...(data.rating !== undefined && { rating: data.rating }),
        ...(data.publishedAt !== undefined && { publishedAt: data.publishedAt }),
        ...(uniqueGenreSlugs !== undefined && {
          genres: {
            set: uniqueGenreSlugs.map((slug) => ({ slug })),
          },
        }),
      },
      include: {
        genres: true,
      },
    });

    if (embedding) {
      await persistEmbedding(id, embedding, tx, inTransaction);
    }

    return updatedBook;
  };

  return db.$transaction ? db.$transaction(runUpdate) : runUpdate(db);
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

export const DEFAULT_MIN_SIMILARITY = 0.25;

export interface SearchSimilarBooksDeps {
  generateEmbedding?: typeof generateEmbedding;
  findSimilarBooks?: typeof findSimilarBooks;
}

export async function searchSimilarBooks(
  query: string,
  limit = 5,
  minSimilarity = DEFAULT_MIN_SIMILARITY,
  deps?: SearchSimilarBooksDeps,
): Promise<SimilarBook[]> {
  if (
    !Number.isFinite(minSimilarity) ||
    minSimilarity < 0 ||
    minSimilarity > 1
  ) {
    throw new RangeError("minSimilarity must be between 0 and 1");
  }

  const genEmbedding = deps?.generateEmbedding ?? generateEmbedding;
  const findSimilar = deps?.findSimilarBooks ?? findSimilarBooks;

  const queryEmbedding = await genEmbedding(query);
  const results = await findSimilar(queryEmbedding, limit);

  return results.filter((book) => book.similarity >= minSimilarity);
}

export type SimilarBook = {
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
  deps?: {
    prisma?: {
      $queryRaw: <T = unknown>(
        query: TemplateStringsArray,
        ...values: unknown[]
      ) => Promise<T>;
    };
  },
): Promise<SimilarBook[]> {
  const db = deps?.prisma ?? prisma;
  const vector = `[${embedding.join(",")}]`;

  return db.$queryRaw<SimilarBook[]>`
    WITH top_books AS (
      SELECT
        b."id",
        b."title",
        b."author",
        b."description",
        b."coverUrl",
        b."rating",
        b."publishedAt",
        b."createdAt",
        (
          1 - (b."embedding" <=> ${vector}::vector)
        )::double precision AS similarity
      FROM "books" b
      WHERE b."embedding" IS NOT NULL
      ORDER BY b."embedding" <=> ${vector}::vector
      LIMIT ${limit}
    )
    SELECT
      tb."id",
      tb."title",
      tb."author",
      tb."description",
      tb."coverUrl",
      tb."rating",
      tb."publishedAt",
      tb."createdAt",
      COALESCE(
        json_agg(
          json_build_object('slug', g."slug", 'name', g."name")
        ) FILTER (WHERE g."slug" IS NOT NULL),
        '[]'::json
      ) AS "genres",
      tb."similarity"
    FROM top_books tb
    LEFT JOIN "_BookToGenre" bg ON tb."id" = bg."A"
    LEFT JOIN "genres" g ON bg."B" = g."slug"
    GROUP BY
      tb."id",
      tb."title",
      tb."author",
      tb."description",
      tb."coverUrl",
      tb."rating",
      tb."publishedAt",
      tb."createdAt",
      tb."similarity"
    ORDER BY tb."similarity" DESC
  `;
}
