import { openai, prisma } from "@/lib";
import { z } from "zod";

const bookSchema = z.object({
  title: z.string(),
  author: z.string(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  genreId: z.string(),
  rating: z.number().nullable(),
  publishedAt: z.coerce.date().nullable(),
});

const buildSearchableText = (book: {
  title: string;
  author: string;
  description: string | null;
}) => {
  return [
    `Título: ${book.title}`,
    `Autor: ${book.author}`,
    `Descrição: ${book.description ?? ""}`,
  ].join("\n");
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

export const createBook = async (input: z.infer<typeof bookSchema>) => {
  const validGenre = await prisma.genre.findUnique({
    where: { id: input.genreId },
  });

  if (!validGenre) {
    throw new Error("Genre not found");
  }

  const searchableText = buildSearchableText(input);
  const embedding = await generateEmbedding(searchableText);

  const book = await prisma.book.create({
    data: input,
  });

  await saveBookEmbedding(book.id, embedding);

  return book;
};

export const reindexBooks = async (mode: "missing" | "all" = "missing") => {
  type BookToIndex = {
    id: string;
    title: string;
    author: string;
    description: string | null;
  };

  const books =
    mode === "missing"
      ? await prisma.$queryRaw<BookToIndex[]>`
          SELECT "id", "title", "author", "description"
          FROM "books"
          WHERE "embedding" IS NULL
        `
      : await prisma.book.findMany({
          select: {
            id: true,
            title: true,
            author: true,
            description: true,
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
  similarity: number;
};

export async function findSimilarBooks(
  embedding: number[],
  limit = 5,
): Promise<SimilarBook[]> {
  const vector = `[${embedding.join(",")}]`;

  return prisma.$queryRaw<SimilarBook[]>`
    SELECT
      "id",
      "title",
      "author",
      "description",
      (
        1 - ("embedding" <=> ${vector}::vector)
      )::double precision AS similarity
    FROM "books"
    WHERE "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${vector}::vector
    LIMIT ${limit}
  `;
}
