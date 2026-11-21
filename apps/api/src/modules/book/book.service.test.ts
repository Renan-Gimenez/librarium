import { describe, expect, it, mock } from "bun:test";

import {
  createBook,
  findSimilarBooks,
  listBooks,
  searchSimilarBooks,
  updateBook,
  type CreateBookTx,
  type UpdateBookTx,
  type BookWithGenres,
  type SimilarBook,
} from "./book.service";

const createTxSpy = <Tx>(
  runner: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>,
) => {
  const spy = mock(runner);
  const $transaction = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    spy(fn) as Promise<T>;
  return { spy, $transaction };
};

const makeBook = (overrides: Partial<BookWithGenres> = {}): BookWithGenres => ({
  id: "book-1",
  title: "Duna",
  author: "Frank Herbert",
  description: "Épico de ficção científica no planeta desértico Arrakis.",
  coverUrl: "https://example.com/duna.jpg",
  rating: 4.8,
  publishedAt: new Date("1965-08-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  genres: [
    {
      slug: "ficcao-cientifica",
      name: "Ficção Científica",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  ...overrides,
});

const makeSimilarBook = (
  overrides: Partial<SimilarBook> = {},
): SimilarBook => ({
  id: "book-1",
  title: "Solaris",
  author: "Stanislaw Lem",
  description: "Solidão e mistério em uma estação espacial sobre um oceano vivo.",
  coverUrl: null,
  rating: 4.7,
  publishedAt: new Date("1961-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  genres: [{ slug: "ficcao-cientifica", name: "Ficção Científica" }],
  similarity: 0.85,
  ...overrides,
});

describe("book.service", () => {
  describe("listBooks", () => {
    it("filters genre by slug or name case-insensitively and sorts rating with nulls last", async () => {
      const sampleBook = makeBook();
      const findManyMock = mock(async () => [sampleBook]);
      const countMock = mock(async () => 1);

      const result = await listBooks(
        {
          genre: "Ficção Científica",
          minRating: 4.5,
          page: 1,
          limit: 5,
          sortBy: "rating",
          order: "desc",
        },
        {
          prisma: {
            book: {
              findMany: findManyMock,
              count: countMock,
            },
          },
        },
      );

      expect(result.books).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 5,
        totalPages: 1,
      });

      expect(findManyMock).toHaveBeenCalledTimes(1);
      const findManyArgs = (findManyMock.mock.calls[0] as unknown[])[0] as {
        where: { AND: unknown[] };
        orderBy: Record<string, unknown>;
        skip: number;
        take: number;
      };

      expect(findManyArgs.where).toEqual({
        AND: [
          {
            genres: {
              some: {
                OR: [
                  { slug: { equals: "Ficção Científica", mode: "insensitive" } },
                  { name: { equals: "Ficção Científica", mode: "insensitive" } },
                ],
              },
            },
          },
          {
            rating: { gte: 4.5 },
          },
        ],
      });
      expect(findManyArgs.orderBy).toEqual({
        rating: { sort: "desc", nulls: "last" },
      });
      expect(findManyArgs.skip).toBe(0);
      expect(findManyArgs.take).toBe(5);
      expect(countMock).toHaveBeenCalledWith({ where: findManyArgs.where });
    });

    it("sorts publishedAt with nulls last and keeps plain sort for non-nullable title", async () => {
      const findManyMock = mock(async () => []);
      const countMock = mock(async () => 0);

      await listBooks(
        {
          page: 1,
          limit: 10,
          sortBy: "publishedAt",
          order: "asc",
        },
        {
          prisma: {
            book: { findMany: findManyMock, count: countMock },
          },
        },
      );

      const pubArgs = (findManyMock.mock.calls[0] as unknown[])[0] as {
        orderBy: Record<string, unknown>;
      };
      expect(pubArgs.orderBy).toEqual({
        publishedAt: { sort: "asc", nulls: "last" },
      });

      await listBooks(
        {
          page: 1,
          limit: 10,
          sortBy: "title",
          order: "asc",
        },
        {
          prisma: {
            book: { findMany: findManyMock, count: countMock },
          },
        },
      );

      const titleArgs = (findManyMock.mock.calls[1] as unknown[])[0] as {
        orderBy: Record<string, unknown>;
      };
      expect(titleArgs.orderBy).toEqual({ title: "asc" });
    });
  });

  describe("createBook", () => {
    it("deduplicates genreSlugs in a single query, generates embedding before $transaction, and persists book + vector atomically via tx.$executeRaw", async () => {
      const callOrder: string[] = [];
      const createdBook = makeBook({
        id: "new-book-1",
        genres: [
          {
            slug: "ficcao-cientifica",
            name: "Ficção Científica",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
          {
            slug: "aventura",
            name: "Aventura",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      });

      const findGenresMock = mock(async () => {
        callOrder.push("genre.findMany");
        return [
          { slug: "ficcao-cientifica", name: "Ficção Científica" },
          { slug: "aventura", name: "Aventura" },
        ];
      });

      const genEmbeddingMock = mock(async () => {
        callOrder.push("generateEmbedding");
        return [0.11, 0.22, 0.33];
      });

      let rawContextTag: string | undefined;
      let capturedSql = "";
      let capturedValues: unknown[] = [];

      const txBookCreateMock = mock(async () => {
        callOrder.push("tx.book.create");
        return createdBook;
      });

      const fakeTx: CreateBookTx & { contextTag: string } = {
        contextTag: "tx-bound",
        book: {
          create: txBookCreateMock,
        },
        async $executeRaw(
          this: { contextTag?: string },
          strings: TemplateStringsArray,
          ...values: unknown[]
        ) {
          callOrder.push("tx.$executeRaw");
          rawContextTag = this?.contextTag;
          capturedSql = strings.join("?");
          capturedValues = values;
          return 1;
        },
      };

      const outerBookCreateMock = mock(async () => {
        throw new Error("Should not call outer prisma.book.create directly");
      });

      const { spy: transactionMock, $transaction } = createTxSpy<CreateBookTx>(
        async (fn) => {
          callOrder.push("$transaction:start");
          const result = await fn(fakeTx);
          callOrder.push("$transaction:end");
          return result;
        },
      );

      const result = await createBook(
        {
          title: "Duna",
          author: "Frank Herbert",
          description: "Épico no planeta Arrakis.",
          genreSlugs: ["ficcao-cientifica", "ficcao-cientifica", "aventura"],
        },
        {
          prisma: {
            book: { create: outerBookCreateMock },
            genre: { findMany: findGenresMock },
            $transaction,
          },
          generateEmbedding: genEmbeddingMock,
        },
      );

      expect(result).toEqual(createdBook);
      expect(findGenresMock).toHaveBeenCalledTimes(1);
      expect(findGenresMock).toHaveBeenCalledWith({
        where: { slug: { in: ["ficcao-cientifica", "aventura"] } },
      });
      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).toContain("Gêneros: Ficção Científica, Aventura");
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(outerBookCreateMock).not.toHaveBeenCalled();

      const createArgs = (txBookCreateMock.mock.calls[0] as unknown[])[0] as {
        data: { genres: { connect: { slug: string }[] } };
      };
      expect(createArgs.data.genres.connect).toEqual([
        { slug: "ficcao-cientifica" },
        { slug: "aventura" },
      ]);

      expect(rawContextTag).toBe("tx-bound");
      expect(capturedSql).toContain('UPDATE "books"');
      expect(capturedValues).toEqual(["[0.11,0.22,0.33]", "new-book-1"]);
      expect(callOrder).toEqual([
        "genre.findMany",
        "generateEmbedding",
        "$transaction:start",
        "tx.book.create",
        "tx.$executeRaw",
        "$transaction:end",
      ]);
    });

    it("skips genre query when genreSlugs is empty and still creates book and embedding atomically", async () => {
      const findGenresMock = mock(async () => []);
      const genEmbeddingMock = mock(async () => [0.5, 0.5]);
      const saveEmbeddingMock = mock(async () => undefined);
      const txBookCreateMock = mock(async () =>
        makeBook({ id: "book-empty-genres", genres: [] }),
      );
      const { $transaction } = createTxSpy<CreateBookTx>(async (fn) =>
        fn({ book: { create: txBookCreateMock } }),
      );

      const result = await createBook(
        {
          title: "Sem Gênero",
          author: "Autor Teste",
          genreSlugs: [],
        },
        {
          prisma: {
            genre: { findMany: findGenresMock },
            $transaction,
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(result.id).toBe("book-empty-genres");
      expect(findGenresMock).not.toHaveBeenCalled();
      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(saveEmbeddingMock).toHaveBeenCalledWith("book-empty-genres", [
        0.5, 0.5,
      ]);
    });

    it("aborts before calling generateEmbedding or $transaction when any genreSlug does not exist", async () => {
      const findGenresMock = mock(async () => [
        { slug: "ficcao-cientifica", name: "Ficção Científica" },
      ]);
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const { spy: transactionMock, $transaction } = createTxSpy<CreateBookTx>(
        async (fn) => fn({ book: { create: mock(async () => makeBook()) } }),
      );

      await expect(
        createBook(
          {
            title: "Livro Inválido",
            author: "Autor",
            genreSlugs: ["ficcao-cientifica", "genero-inexistente"],
          },
          {
            prisma: {
              genre: { findMany: findGenresMock },
              $transaction,
            },
            generateEmbedding: genEmbeddingMock,
          },
        ),
      ).rejects.toThrow("Genre(s) not found: genero-inexistente");

      expect(findGenresMock).toHaveBeenCalledTimes(1);
      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("propagates generateEmbedding errors without opening $transaction", async () => {
      const { spy: transactionMock, $transaction } = createTxSpy<CreateBookTx>(
        async (fn) => fn({ book: { create: mock(async () => makeBook()) } }),
      );

      await expect(
        createBook(
          {
            title: "Livro",
            author: "Autor",
            genreSlugs: [],
          },
          {
            prisma: {
              genre: { findMany: mock(async () => []) },
              $transaction,
            },
            generateEmbedding: mock(async () => {
              throw new Error("OpenAI rate limit");
            }),
          },
        ),
      ).rejects.toThrow("OpenAI rate limit");

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("rolls back $transaction and propagates error when saveBookEmbedding fails after tx.book.create", async () => {
      const committedBooks: BookWithGenres[] = [];
      let rolledBack = false;

      const { spy: transactionMock, $transaction } = createTxSpy<CreateBookTx>(
        async (fn) => {
          const stagedBooks: BookWithGenres[] = [];
          const tx: CreateBookTx = {
            book: {
              create: mock(async () => {
                const created = makeBook({ id: "orphan-candidate" });
                stagedBooks.push(created);
                return created;
              }),
            },
            $executeRaw: mock(async () => {
              throw new Error("Vector write failed");
            }),
          };

          try {
            const result = await fn(tx);
            committedBooks.push(...stagedBooks);
            return result;
          } catch (err) {
            rolledBack = true;
            throw err;
          }
        },
      );

      await expect(
        createBook(
          {
            title: "Livro Órfão",
            author: "Autor",
            genreSlugs: [],
          },
          {
            prisma: {
              genre: { findMany: mock(async () => []) },
              $transaction,
            },
            generateEmbedding: mock(async () => [0.9, 0.1]),
          },
        ),
      ).rejects.toThrow("Vector write failed");

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(rolledBack).toBe(true);
      expect(committedBooks).toHaveLength(0);
    });

    it("throws when $transaction supplies tx without $executeRaw and no custom saveBookEmbedding is injected", async () => {
      const outerExecuteRawMock = mock(async () => 1);
      const { spy: transactionMock, $transaction } = createTxSpy<CreateBookTx>(
        async (fn) =>
          fn({
            book: {
              create: mock(async () => makeBook({ id: "missing-raw-tx" })),
            },
          }),
      );

      await expect(
        createBook(
          {
            title: "Sem $executeRaw no tx",
            author: "Autor",
            genreSlugs: [],
          },
          {
            prisma: {
              genre: { findMany: mock(async () => []) },
              $executeRaw: outerExecuteRawMock,
              $transaction,
            },
            generateEmbedding: mock(async () => [0.3, 0.7]),
          },
        ),
      ).rejects.toThrow("Transaction client must provide $executeRaw");

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(outerExecuteRawMock).not.toHaveBeenCalled();
    });
  });

  describe("updateBook", () => {
    it("returns null without generating embedding when book does not exist", async () => {
      const findUniqueMock = mock(async () => null);
      const updateMock = mock(async () => makeBook());
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const saveEmbeddingMock = mock(async () => undefined);

      const result = await updateBook(
        "missing-id",
        { title: "Novo Título" },
        {
          prisma: {
            book: { findUnique: findUniqueMock, update: updateMock },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(result).toBeNull();
      expect(updateMock).not.toHaveBeenCalled();
      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(saveEmbeddingMock).not.toHaveBeenCalled();
    });

    it("skips generateEmbedding and saveBookEmbedding on partial update with only rating", async () => {
      const existing = makeBook({ rating: 4.0 });
      const updated = makeBook({ rating: 4.9 });
      const updateMock = mock(async () => updated);
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const saveEmbeddingMock = mock(async () => undefined);

      const result = await updateBook(
        existing.id,
        { rating: 4.9 },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: updateMock,
            },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(result).toEqual(updated);
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(saveEmbeddingMock).not.toHaveBeenCalled();
    });

    it("skips generateEmbedding and saveBookEmbedding on partial update with only coverUrl", async () => {
      const existing = makeBook();
      const updated = makeBook({ coverUrl: "https://example.com/new-cover.jpg" });
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const saveEmbeddingMock = mock(async () => undefined);

      const result = await updateBook(
        existing.id,
        { coverUrl: "https://example.com/new-cover.jpg" },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => updated),
            },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(result).toEqual(updated);
      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(saveEmbeddingMock).not.toHaveBeenCalled();
    });

    it("skips embedding regeneration when indexable fields are passed with identical values (including null description)", async () => {
      const existing = makeBook({ description: null });
      const updated = makeBook({ description: null, rating: 5.0 });
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const saveEmbeddingMock = mock(async () => undefined);

      await updateBook(
        existing.id,
        {
          title: existing.title,
          author: existing.author,
          description: null,
          genreSlugs: ["ficcao-cientifica"],
          rating: 5.0,
        },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => updated),
            },
            genre: {
              findMany: mock(async () => [
                { slug: "ficcao-cientifica", name: "Ficção Científica" },
              ]),
            },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(saveEmbeddingMock).not.toHaveBeenCalled();
    });

    it("regenerates and saves embedding when only title changes", async () => {
      const existing = makeBook();
      const updated = makeBook({ title: "Messias de Duna" });
      const vector = [0.25, 0.75];
      const genEmbeddingMock = mock(async () => vector);
      const saveEmbeddingMock = mock(async () => undefined);

      const result = await updateBook(
        existing.id,
        { title: "Messias de Duna" },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => updated),
            },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(result).toEqual(updated);
      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).toContain("Título: Messias de Duna");
      expect(saveEmbeddingMock).toHaveBeenCalledWith(existing.id, vector);
    });

    it("regenerates and saves embedding when only author changes", async () => {
      const existing = makeBook();
      const vector = [0.3, 0.7];
      const genEmbeddingMock = mock(async () => vector);
      const saveEmbeddingMock = mock(async () => undefined);

      await updateBook(
        existing.id,
        { author: "F. Herbert" },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => existing),
            },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).toContain("Autor: F. Herbert");
      expect(saveEmbeddingMock).toHaveBeenCalledWith(existing.id, vector);
    });

    it("regenerates and saves embedding when only description changes to null", async () => {
      const existing = makeBook({ description: "Descrição original" });
      const vector = [0.4, 0.6];
      const genEmbeddingMock = mock(async () => vector);
      const saveEmbeddingMock = mock(async () => undefined);

      await updateBook(
        existing.id,
        { description: null },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => makeBook({ description: null })),
            },
            genre: { findMany: mock(async () => []) },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).toContain("Descrição: ");
      expect(saveEmbeddingMock).toHaveBeenCalledWith(existing.id, vector);
    });

    it("regenerates embedding when only genreSlugs changes to another slug of same count and deduplicates duplicates", async () => {
      const existing = makeBook(); // has ["ficcao-cientifica"]
      const findGenresMock = mock(async () => [
        { slug: "aventura", name: "Aventura" },
      ]);
      const updateMock = mock(async () => existing);
      const genEmbeddingMock = mock(async () => [0.5, 0.5]);
      const saveEmbeddingMock = mock(async () => undefined);

      await updateBook(
        existing.id,
        { genreSlugs: ["aventura", "aventura"] },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: updateMock,
            },
            genre: { findMany: findGenresMock },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(findGenresMock).toHaveBeenCalledWith({
        where: { slug: { in: ["aventura"] } },
      });

      const updateArgs = (updateMock.mock.calls[0] as unknown[])[0] as {
        data: { genres: { set: { slug: string }[] } };
      };
      expect(updateArgs.data.genres.set).toEqual([{ slug: "aventura" }]);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).toContain("Gêneros: Aventura");
      expect(saveEmbeddingMock).toHaveBeenCalledTimes(1);
    });

    it("regenerates embedding when genreSlugs is cleared to empty array", async () => {
      const existing = makeBook();
      const findGenresMock = mock(async () => []);
      const genEmbeddingMock = mock(async () => [0.6, 0.4]);
      const saveEmbeddingMock = mock(async () => undefined);

      await updateBook(
        existing.id,
        { genreSlugs: [] },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => makeBook({ genres: [] })),
            },
            genre: { findMany: findGenresMock },
          },
          generateEmbedding: genEmbeddingMock,
          saveBookEmbedding: saveEmbeddingMock,
        },
      );

      expect(findGenresMock).not.toHaveBeenCalled();
      expect(genEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(
        (genEmbeddingMock.mock.calls[0] as unknown[])[0] as string,
      ).not.toContain("Gêneros:");
      expect(saveEmbeddingMock).toHaveBeenCalledTimes(1);
    });

    it("preserves this binding when calling deps.prisma.$executeRaw", async () => {
      const existing = makeBook();
      let receivedContextTag: string | undefined;

      const fakePrisma = {
        contextTag: "bound-prisma",
        book: {
          findUnique: mock(async () => existing),
          update: mock(async () => existing),
        },
        genre: { findMany: mock(async () => []) },
        async $executeRaw(
          this: { contextTag?: string },
          _query: TemplateStringsArray,
          ..._values: unknown[]
        ) {
          receivedContextTag = this?.contextTag;
          return 1;
        },
      };

      await updateBook(
        existing.id,
        { title: "Filhos de Duna" },
        {
          prisma: fakePrisma,
          generateEmbedding: mock(async () => [0.1, 0.9]),
        },
      );

      expect(receivedContextTag).toBe("bound-prisma");
    });

    it("propagates errors from generateEmbedding without updating or saving embedding", async () => {
      const existing = makeBook();
      const updateMock = mock(async () => existing);
      const saveEmbeddingMock = mock(async () => undefined);
      const genEmbeddingMock = mock(async () => {
        throw new Error("OpenAI embedding failure");
      });

      await expect(
        updateBook(
          existing.id,
          { title: "Título Alterado" },
          {
            prisma: {
              book: {
                findUnique: mock(async () => existing),
                update: updateMock,
              },
              genre: { findMany: mock(async () => []) },
            },
            generateEmbedding: genEmbeddingMock,
            saveBookEmbedding: saveEmbeddingMock,
          },
        ),
      ).rejects.toThrow("OpenAI embedding failure");

      expect(updateMock).not.toHaveBeenCalled();
      expect(saveEmbeddingMock).not.toHaveBeenCalled();
    });

    it("propagates errors from saveBookEmbedding", async () => {
      const existing = makeBook();
      const saveEmbeddingMock = mock(async () => {
        throw new Error("Database vector write failure");
      });

      await expect(
        updateBook(
          existing.id,
          { description: "Sinopse atualizada" },
          {
            prisma: {
              book: {
                findUnique: mock(async () => existing),
                update: mock(async () => existing),
              },
              genre: { findMany: mock(async () => []) },
            },
            generateEmbedding: mock(async () => [0.1, 0.2]),
            saveBookEmbedding: saveEmbeddingMock,
          },
        ),
      ).rejects.toThrow("Database vector write failure");
    });

    it("generates embedding before $transaction and executes tx.book.update + tx.$executeRaw atomically on semantic change", async () => {
      const existing = makeBook();
      const updated = makeBook({ title: "Hereges de Duna" });
      const callOrder: string[] = [];
      let rawContextTag: string | undefined;

      const findUniqueMock = mock(async () => {
        callOrder.push("book.findUnique");
        return existing;
      });
      const findGenresMock = mock(async () => {
        callOrder.push("genre.findMany");
        return [{ slug: "aventura", name: "Aventura" }];
      });
      const genEmbeddingMock = mock(async () => {
        callOrder.push("generateEmbedding");
        return [0.42, 0.58];
      });
      const txUpdateMock = mock(async () => {
        callOrder.push("tx.book.update");
        return updated;
      });

      const fakeTx: UpdateBookTx & { contextTag: string } = {
        contextTag: "update-tx-bound",
        book: { update: txUpdateMock },
        async $executeRaw(this: { contextTag?: string }) {
          callOrder.push("tx.$executeRaw");
          rawContextTag = this?.contextTag;
          return 1;
        },
      };

      const { $transaction } = createTxSpy<UpdateBookTx>(async (fn) => {
        callOrder.push("$transaction:start");
        const res = await fn(fakeTx);
        callOrder.push("$transaction:end");
        return res;
      });

      const result = await updateBook(
        existing.id,
        { title: "Hereges de Duna", genreSlugs: ["aventura", "aventura"] },
        {
          prisma: {
            book: {
              findUnique: findUniqueMock,
              update: mock(async () => {
                throw new Error("Should not call outer prisma.book.update");
              }),
            },
            genre: { findMany: findGenresMock },
            $transaction,
          },
          generateEmbedding: genEmbeddingMock,
        },
      );

      expect(result).toEqual(updated);
      expect(rawContextTag).toBe("update-tx-bound");
      expect(callOrder).toEqual([
        "book.findUnique",
        "genre.findMany",
        "generateEmbedding",
        "$transaction:start",
        "tx.book.update",
        "tx.$executeRaw",
        "$transaction:end",
      ]);
    });

    it("rolls back $transaction on semantic update when vector write fails after tx.book.update", async () => {
      const existing = makeBook({ title: "Título Original" });
      let persistedTitle = existing.title;
      let rolledBack = false;

      const { $transaction } = createTxSpy<UpdateBookTx>(async (fn) => {
        let stagedTitle = persistedTitle;
        const tx: UpdateBookTx = {
          book: {
            update: mock(async () => {
              stagedTitle = "Título Não Commitado";
              return makeBook({ title: stagedTitle });
            }),
          },
          $executeRaw: mock(async () => {
            throw new Error("Vector update failed");
          }),
        };

        try {
          const res = await fn(tx);
          persistedTitle = stagedTitle;
          return res;
        } catch (err) {
          rolledBack = true;
          throw err;
        }
      });

      await expect(
        updateBook(
          existing.id,
          { title: "Título Não Commitado" },
          {
            prisma: {
              book: {
                findUnique: mock(async () => existing),
                update: mock(async () => existing),
              },
              genre: { findMany: mock(async () => []) },
              $transaction,
            },
            generateEmbedding: mock(async () => [0.2, 0.8]),
          },
        ),
      ).rejects.toThrow("Vector update failed");

      expect(rolledBack).toBe(true);
      expect(persistedTitle).toBe("Título Original");
    });

    it("aborts updateBook before generateEmbedding and $transaction when genreSlugs contains missing slug", async () => {
      const existing = makeBook();
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const { spy: transactionMock, $transaction } = createTxSpy<UpdateBookTx>(
        async (fn) => fn({ book: { update: mock(async () => existing) } }),
      );

      await expect(
        updateBook(
          existing.id,
          { genreSlugs: ["nao-existe"] },
          {
            prisma: {
              book: {
                findUnique: mock(async () => existing),
                update: mock(async () => existing),
              },
              genre: { findMany: mock(async () => []) },
              $transaction,
            },
            generateEmbedding: genEmbeddingMock,
          },
        ),
      ).rejects.toThrow("Genre(s) not found: nao-existe");

      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("updates metadata inside $transaction without embedding on non-semantic change", async () => {
      const existing = makeBook({ rating: 4.0 });
      const updated = makeBook({ rating: 5.0 });
      const genEmbeddingMock = mock(async () => [0.1, 0.2]);
      const executeRawMock = mock(async () => 1);
      const txUpdateMock = mock(async () => updated);

      const { spy: transactionMock, $transaction } = createTxSpy<UpdateBookTx>(
        async (fn) =>
          fn({
            book: { update: txUpdateMock },
            $executeRaw: executeRawMock,
          }),
      );

      const result = await updateBook(
        existing.id,
        { rating: 5.0 },
        {
          prisma: {
            book: {
              findUnique: mock(async () => existing),
              update: mock(async () => existing),
            },
            genre: { findMany: mock(async () => []) },
            $transaction,
          },
          generateEmbedding: genEmbeddingMock,
        },
      );

      expect(result).toEqual(updated);
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(txUpdateMock).toHaveBeenCalledTimes(1);
      expect(genEmbeddingMock).not.toHaveBeenCalled();
      expect(executeRawMock).not.toHaveBeenCalled();
    });
  });

  describe("findSimilarBooks", () => {
    it("isolates vector top-K search inside WITH top_books CTE before joining genres", async () => {
      const expected = [makeSimilarBook()];
      let capturedSql = "";
      let capturedValues: unknown[] = [];

      const queryRawMock = mock(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          capturedSql = strings.join("?");
          capturedValues = values;
          return expected;
        },
      );

      const result = await findSimilarBooks([0.1, 0.2, 0.3], 7, {
        prisma: {
          $queryRaw: <T = unknown>(
            query: TemplateStringsArray,
            ...values: unknown[]
          ) => queryRawMock(query, ...values) as Promise<T>,
        },
      });

      expect(result).toEqual(expected);
      expect(queryRawMock).toHaveBeenCalledTimes(1);

      const cteIndex = capturedSql.indexOf("WITH top_books AS");
      const joinIndex = capturedSql.indexOf('LEFT JOIN "_BookToGenre"');
      const orderDescIndex = capturedSql.indexOf('ORDER BY tb."similarity" DESC');

      expect(cteIndex).toBeGreaterThanOrEqual(0);
      expect(joinIndex).toBeGreaterThan(cteIndex);
      expect(capturedSql.slice(cteIndex, joinIndex)).toContain(
        'WHERE b."embedding" IS NOT NULL',
      );
      expect(capturedSql.slice(cteIndex, joinIndex)).toContain(
        'ORDER BY b."embedding" <=>',
      );
      expect(capturedSql.slice(cteIndex, joinIndex)).toContain("LIMIT ?");
      expect(orderDescIndex).toBeGreaterThan(joinIndex);
      expect(capturedValues).toContain("[0.1,0.2,0.3]");
      expect(capturedValues).toContain(7);
    });
  });

  describe("searchSimilarBooks", () => {
    it("filters results post-query using default minSimilarity threshold of 0.25", async () => {
      const highMatch = makeSimilarBook({ id: "b1", similarity: 0.82 });
      const boundaryMatch = makeSimilarBook({ id: "b2", similarity: 0.25 });
      const lowMatch = makeSimilarBook({ id: "b3", similarity: 0.249 });

      const findSimilarMock = mock(async () => [
        highMatch,
        boundaryMatch,
        lowMatch,
      ]);
      const genEmbeddingMock = mock(async () => [0.5, 0.5]);

      const results = await searchSimilarBooks("solidão no espaço", 5, undefined, {
        generateEmbedding: genEmbeddingMock,
        findSimilarBooks: findSimilarMock,
      });

      expect(genEmbeddingMock).toHaveBeenCalledWith("solidão no espaço");
      expect(findSimilarMock).toHaveBeenCalledWith([0.5, 0.5], 5);
      expect(results).toEqual([highMatch, boundaryMatch]);
    });

    it("supports custom minSimilarity threshold and returns empty array when nothing meets it", async () => {
      const lowMatch = makeSimilarBook({ id: "b1", similarity: 0.4 });
      const findSimilarMock = mock(async () => [lowMatch]);

      const results = await searchSimilarBooks("tema distante", 3, 0.6, {
        generateEmbedding: mock(async () => [0.1, 0.2]),
        findSimilarBooks: findSimilarMock,
      });

      expect(findSimilarMock).toHaveBeenCalledWith([0.1, 0.2], 3);
      expect(results).toEqual([]);
    });

    it("throws RangeError for invalid minSimilarity values (NaN, < 0, > 1)", async () => {
      const genEmbeddingMock = mock(async () => [0.1]);

      await expect(
        searchSimilarBooks("espaço", 5, Number.NaN, {
          generateEmbedding: genEmbeddingMock,
        }),
      ).rejects.toThrow(RangeError);

      await expect(
        searchSimilarBooks("espaço", 5, -0.1, {
          generateEmbedding: genEmbeddingMock,
        }),
      ).rejects.toThrow(RangeError);

      await expect(
        searchSimilarBooks("espaço", 5, 1.05, {
          generateEmbedding: genEmbeddingMock,
        }),
      ).rejects.toThrow(RangeError);

      expect(genEmbeddingMock).not.toHaveBeenCalled();
    });
  });
});
