import { openai, prisma } from "@/lib";
import { Prisma } from "@/generated/prisma/client";
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
    .enum([
      "title",
      "author",
      "rating",
      "publishedAt",
      "createdAt",
      "relevance",
    ])
    .optional(),
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
    book?: {
      findMany: (args: {
        where?: Prisma.BookWhereInput;
        include: { genres: true };
        orderBy?: Prisma.BookOrderByWithRelationInput;
        skip?: number;
        take?: number;
      }) => Promise<BookWithGenres[]>;
      count: (args: { where?: Prisma.BookWhereInput }) => Promise<number>;
    };
    $queryRaw?: <T = unknown>(
      query: TemplateStringsArray | Prisma.Sql,
      ...values: unknown[]
    ) => Promise<T>;
  };
}

const MAX_FTS_TOKENS = 32;

/**
 * Converts a user search string into a PostgreSQL prefix `tsquery` expression
 * joining up to 32 Unicode alphanumeric tokens with `&` and `:*`, or returns `null` if none exist.
 */
export const buildPrefixTsQuery = (search: string): string | null => {
  const tokens = search
    .normalize("NFC")
    .match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu);

  if (!tokens || tokens.length === 0) {
    return null;
  }

  return tokens
    .slice(0, MAX_FTS_TOKENS)
    .map((token) => `${token}:*`)
    .join(" & ");
};

type NonRelevanceSortBy = Exclude<
  NonNullable<ListBooksQuery["sortBy"]>,
  "relevance"
>;
type SortOrder = ListBooksQuery["order"];

const FTS_ORDER_BY_MAP: Record<
  `${NonRelevanceSortBy}_${SortOrder}` | "relevance",
  Prisma.Sql
> = {
  relevance: Prisma.sql`"rank" DESC, b."createdAt" DESC, b."id" ASC`,
  title_asc: Prisma.sql`b."title" ASC, "rank" DESC, b."createdAt" DESC, b."id" ASC`,
  title_desc: Prisma.sql`b."title" DESC, "rank" DESC, b."createdAt" DESC, b."id" ASC`,
  author_asc: Prisma.sql`b."author" ASC, "rank" DESC, b."createdAt" DESC, b."id" ASC`,
  author_desc: Prisma.sql`b."author" DESC, "rank" DESC, b."createdAt" DESC, b."id" ASC`,
  rating_asc: Prisma.sql`b."rating" ASC NULLS LAST, "rank" DESC, b."createdAt" DESC, b."id" ASC`,
  rating_desc: Prisma.sql`b."rating" DESC NULLS LAST, "rank" DESC, b."createdAt" DESC, b."id" ASC`,
  publishedAt_asc: Prisma.sql`b."publishedAt" ASC NULLS LAST, "rank" DESC, b."createdAt" DESC, b."id" ASC`,
  publishedAt_desc: Prisma.sql`b."publishedAt" DESC NULLS LAST, "rank" DESC, b."createdAt" DESC, b."id" ASC`,
  createdAt_asc: Prisma.sql`b."createdAt" ASC, "rank" DESC, b."id" ASC`,
  createdAt_desc: Prisma.sql`b."createdAt" DESC, "rank" DESC, b."id" ASC`,
};

const getFtsOrderBySql = (
  sortBy: ListBooksQuery["sortBy"],
  order: SortOrder,
): Prisma.Sql => {
  const effectiveSortBy = sortBy ?? "relevance";

  if (effectiveSortBy === "relevance") {
    return FTS_ORDER_BY_MAP.relevance;
  }

  const key = `${effectiveSortBy}_${order}` as Exclude<
    keyof typeof FTS_ORDER_BY_MAP,
    "relevance"
  >;
  return FTS_ORDER_BY_MAP[key] ?? FTS_ORDER_BY_MAP.relevance;
};

type RawGenreRow = {
  slug: string;
  name: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type RawBookRow = {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  rating: number | null;
  publishedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  genres: RawGenreRow[] | string | null;
};

type CountRow = {
  total: bigint | number | string;
};

const toDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value);

const toNullableDate = (value: Date | string | null | undefined): Date | null =>
  value == null ? null : toDate(value);

const hydrateRawBook = (row: RawBookRow): BookWithGenres => {
  const rawGenres: RawGenreRow[] =
    typeof row.genres === "string"
      ? (JSON.parse(row.genres) as RawGenreRow[])
      : (row.genres ?? []);

  return {
    id: row.id,
    title: row.title,
    author: row.author,
    description: row.description,
    coverUrl: row.coverUrl,
    rating: row.rating,
    publishedAt: toNullableDate(row.publishedAt),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
    genres: rawGenres.map((genre) => ({
      slug: genre.slug,
      name: genre.name,
      createdAt: toDate(genre.createdAt),
      updatedAt: toDate(genre.updatedAt),
    })),
  };
};

const buildFtsWhereSql = (params: {
  tsQuery: string;
  title?: string;
  author?: string;
  genre?: string;
  minRating?: number;
}): Prisma.Sql => {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`b."search_vector" @@ to_tsquery('simple', public.unaccent(${params.tsQuery}))`,
  ];

  if (params.title) {
    conditions.push(
      Prisma.sql`STRPOS(LOWER(b."title"), LOWER(${params.title})) > 0`,
    );
  }

  if (params.author) {
    conditions.push(
      Prisma.sql`STRPOS(LOWER(b."author"), LOWER(${params.author})) > 0`,
    );
  }

  if (params.genre) {
    conditions.push(
      Prisma.sql`EXISTS (
        SELECT 1
        FROM "_BookToGenre" bg_filter
        INNER JOIN "genres" g_filter ON g_filter."slug" = bg_filter."B"
        WHERE bg_filter."A" = b."id"
          AND (
            LOWER(g_filter."slug") = LOWER(${params.genre})
            OR LOWER(g_filter."name") = LOWER(${params.genre})
          )
      )`,
    );
  }

  if (params.minRating !== undefined) {
    conditions.push(Prisma.sql`b."rating" >= ${params.minRating}`);
  }

  return Prisma.join(conditions, " AND ");
};

const listBooksWithPrisma = async (
  query: ListBooksQuery,
  db: NonNullable<ListBooksDeps["prisma"]>,
) => {
  if (!db.book) {
    throw new Error("Prisma book repository is required");
  }

  const { title, author, genre, minRating, page, limit, sortBy, order } = query;
  const whereConditions: Prisma.BookWhereInput[] = [];

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
  const effectiveSortBy: NonRelevanceSortBy =
    sortBy && sortBy !== "relevance" ? sortBy : "createdAt";

  const orderBy: Prisma.BookOrderByWithRelationInput =
    effectiveSortBy === "rating" || effectiveSortBy === "publishedAt"
      ? { [effectiveSortBy]: { sort: order, nulls: "last" } }
      : { [effectiveSortBy]: order };

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

  return {
    books,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const listBooksWithFts = async (
  query: ListBooksQuery,
  tsQuery: string,
  db: NonNullable<ListBooksDeps["prisma"]>,
) => {
  if (!db.$queryRaw) {
    throw new Error("Prisma $queryRaw is required for search");
  }

  const { title, author, genre, minRating, page, limit, sortBy, order } = query;
  const skip = (page - 1) * limit;
  const whereSql = buildFtsWhereSql({
    tsQuery,
    title: title?.trim() || undefined,
    author: author?.trim() || undefined,
    genre: genre?.trim() || undefined,
    minRating,
  });
  const orderBySql = getFtsOrderBySql(sortBy, order);

  const dataQuery = Prisma.sql`
    WITH matched_books AS (
      SELECT
        b."id",
        b."title",
        b."author",
        b."description",
        b."coverUrl",
        b."rating",
        b."publishedAt",
        b."createdAt",
        b."updatedAt",
        ts_rank_cd(
          b."search_vector",
          to_tsquery('simple', public.unaccent(${tsQuery}))
        )::double precision AS "rank"
      FROM "books" b
      WHERE ${whereSql}
      ORDER BY ${orderBySql}
      LIMIT ${limit}
      OFFSET ${skip}
    )
    SELECT
      b."id",
      b."title",
      b."author",
      b."description",
      b."coverUrl",
      b."rating",
      b."publishedAt",
      b."createdAt",
      b."updatedAt",
      b."rank",
      COALESCE(
        json_agg(
          json_build_object(
            'slug', g."slug",
            'name', g."name",
            'createdAt', g."createdAt" AT TIME ZONE 'UTC',
            'updatedAt', g."updatedAt" AT TIME ZONE 'UTC'
          )
        ) FILTER (WHERE g."slug" IS NOT NULL),
        '[]'::json
      ) AS "genres"
    FROM matched_books b
    LEFT JOIN "_BookToGenre" bg ON b."id" = bg."A"
    LEFT JOIN "genres" g ON bg."B" = g."slug"
    GROUP BY
      b."id",
      b."title",
      b."author",
      b."description",
      b."coverUrl",
      b."rating",
      b."publishedAt",
      b."createdAt",
      b."updatedAt",
      b."rank"
    ORDER BY ${orderBySql}
  `;

  const countQuery = Prisma.sql`
    SELECT COUNT(*) AS "total"
    FROM "books" b
    WHERE ${whereSql}
  `;

  const [rows, countRows] = await Promise.all([
    db.$queryRaw<RawBookRow[]>(dataQuery),
    db.$queryRaw<CountRow[]>(countQuery),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  return {
    books: rows.map(hydrateRawBook),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const listBooks = async (
  query: ListBooksQuery,
  deps?: ListBooksDeps,
) => {
  const db: NonNullable<ListBooksDeps["prisma"]> = deps?.prisma ?? prisma;
  const trimmedSearch = query.search?.trim();

  if (!trimmedSearch) {
    return listBooksWithPrisma(query, db);
  }

  const tsQuery = buildPrefixTsQuery(trimmedSearch);
  if (!tsQuery) {
    return {
      books: [] as BookWithGenres[],
      meta: {
        total: 0,
        page: query.page,
        limit: query.limit,
        totalPages: 0,
      },
    };
  }

  return listBooksWithFts(query, tsQuery, db);
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
