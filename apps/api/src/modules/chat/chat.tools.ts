import type {
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { z } from "zod";

import {
  addPublishedDateRangeRefinement,
  DEFAULT_MIN_SIMILARITY,
  findSimilarBooksByBookId,
  getCatalogStats,
  listBooks,
  publishedDateStringSchema,
  searchSimilarBooks,
  type BookWithGenres,
  type CatalogStats,
  type FindSimilarBooksByBookIdResult,
  type ListBooksQuery,
  type SimilarBook,
} from "../book/book.service";

export const SEMANTIC_MIN_SIMILARITY = DEFAULT_MIN_SIMILARITY;

const nullToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === null ? undefined : value), schema);

export const searchSemanticBooksArgsSchema = z
  .object({
    query: z.string().trim().min(1, "Query is required"),
    limit: nullToUndefined(z.number().int().min(1).max(10).default(5)),
  })
  .strict();

export const searchBooksArgsSchema = z
  .object({
    query: nullToUndefined(z.string().trim().min(1).optional()),
    title: nullToUndefined(z.string().trim().min(1).optional()),
    author: nullToUndefined(z.string().trim().min(1).optional()),
    genre: nullToUndefined(z.string().trim().min(1).optional()),
    minRating: nullToUndefined(z.number().min(0).max(5).optional()),
    publishedAfter: nullToUndefined(publishedDateStringSchema.optional()),
    publishedBefore: nullToUndefined(publishedDateStringSchema.optional()),
    sortBy: nullToUndefined(
      z
        .enum(["title", "author", "rating", "publishedAt", "createdAt"])
        .default("createdAt"),
    ),
    order: nullToUndefined(z.enum(["asc", "desc"]).default("desc")),
    limit: nullToUndefined(z.number().int().min(1).max(20).default(5)),
  })
  .strict()
  .superRefine(addPublishedDateRangeRefinement);

export const getCatalogStatsArgsSchema = z.object({}).strict();

export const findSimilarBooksArgsSchema = z
  .object({
    bookId: nullToUndefined(z.string().trim().min(1).optional()),
    title: nullToUndefined(z.string().trim().min(1).optional()),
    limit: nullToUndefined(z.number().int().min(1).max(10).default(5)),
  })
  .strict()
  .refine((data) => Boolean(data.bookId || data.title), {
    message: "Either bookId or title must be provided.",
  });

export type SearchSemanticBooksArgs = z.infer<
  typeof searchSemanticBooksArgsSchema
>;
export type SearchBooksArgs = z.infer<typeof searchBooksArgsSchema>;
export type GetCatalogStatsArgs = z.infer<typeof getCatalogStatsArgsSchema>;
export type FindSimilarBooksArgs = z.infer<typeof findSimilarBooksArgsSchema>;

export const CHAT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "searchSemanticBooks",
      description:
        "Busca semântica no acervo por significado, tema, enredo, atmosfera ou conceito usando embeddings e similaridade vetorial. Use para consultas conceituais ou abstratas.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Descrição em linguagem natural do tema, conceito, enredo ou atmosfera buscada.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            description:
              "Quantidade máxima de livros retornados (padrão: 5, máximo: 10).",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchBooks",
      description:
        "Busca estruturada no acervo por título, autor, gênero (slug ou nome), nota mínima, período de publicação (publishedAfter/publishedBefore) ou ordenação. O retorno inclui o campo 'total' com a contagem exata de livros que atendem aos filtros, mesmo quando 'books' é limitado por 'limit'. Use para filtros objetivos, rankings por nota, novidades, recortes temporais e contagens filtradas.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Termo geral para buscar por palavra-chave no título, autor ou sinopse.",
          },
          title: {
            type: "string",
            description: "Filtro parcial pelo título do livro.",
          },
          author: {
            type: "string",
            description: "Filtro parcial pelo nome do autor.",
          },
          genre: {
            type: "string",
            description:
              "Slug ou nome do gênero (ex.: 'fiction' ou 'Fiction').",
          },
          minRating: {
            type: "number",
            minimum: 0,
            maximum: 5,
            description: "Nota mínima do livro entre 0 e 5.",
          },
          publishedAfter: {
            type: "string",
            description:
              "Data inicial inclusiva de publicação no formato YYYY-MM-DD (ex.: '1960-01-01') ou ISO 8601 com fuso horário (ex.: '1960-01-01T00:00:00Z').",
          },
          publishedBefore: {
            type: "string",
            description:
              "Data final inclusiva de publicação no formato YYYY-MM-DD (ex.: '1969-12-31') ou ISO 8601 com fuso horário (ex.: '1969-12-31T23:59:59Z').",
          },
          sortBy: {
            type: "string",
            enum: ["title", "author", "rating", "publishedAt", "createdAt"],
            description:
              "Campo de ordenação dos resultados (padrão: 'createdAt').",
          },
          order: {
            type: "string",
            enum: ["asc", "desc"],
            description: "Direção da ordenação: 'asc' ou 'desc' (padrão: 'desc').",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            description:
              "Quantidade máxima de livros retornados (padrão: 5, máximo: 20).",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCatalogStats",
      description:
        "Retorna estatísticas agregadas reais do catálogo completo: quantidade total de livros, média geral das avaliações, contagem de livros por gênero e datas da obra mais antiga e mais recente. Use para perguntas quantitativas ou panorâmicas sobre todo o acervo.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "findSimilarBooks",
      description:
        "Encontra livros do acervo semelhantes a um livro de referência específico (informando bookId ou title), reutilizando o embedding já salvo da obra sem gerar novos embeddings. Use quando o leitor pedir obras parecidas com um título específico.",
      parameters: {
        type: "object",
        properties: {
          bookId: {
            type: "string",
            description:
              "ID (UUID) do livro de referência, quando já conhecido de uma busca anterior.",
          },
          title: {
            type: "string",
            description:
              "Título do livro de referência no catálogo (usado para localizar a obra quando bookId não for informado).",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            description:
              "Quantidade máxima de livros similares retornados (padrão: 5, máximo: 10).",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

export interface ToolBookCandidate {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  rating: number | null;
  publishedAt: Date | string | null;
  createdAt?: Date | string | null;
  genres: { slug: string; name: string }[];
  similarity?: number;
}

export interface ExecutedToolCallResult {
  toolCallId: string;
  content: string;
  books: ToolBookCandidate[];
}

export interface ChatToolsDeps {
  searchSimilarBooks?: (
    query: string,
    limit?: number,
    minSimilarity?: number,
  ) => Promise<SimilarBook[]>;
  listBooks?: (
    query: ListBooksQuery,
  ) => Promise<{ books: BookWithGenres[]; meta?: { total?: number } }>;
  getCatalogStats?: () => Promise<CatalogStats>;
  findSimilarBooksByBookId?: (
    bookId: string,
    limit?: number,
    minSimilarity?: number,
  ) => Promise<FindSimilarBooksByBookIdResult>;
}

export function toIsoOrNull(
  value: Date | string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeRating(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

const formatToolError = (
  toolCallId: string,
  error: string,
  details?: { path: string; message: string }[],
): ExecutedToolCallResult => ({
  toolCallId,
  content: JSON.stringify(details ? { error, details } : { error }),
  books: [],
});

const serializeBooksForModel = (
  books: ToolBookCandidate[],
  extra?: {
    total?: number;
    referenceBook?: { id: string; title: string; author: string };
    message?: string;
  },
): string =>
  JSON.stringify({
    books: books.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      rating: normalizeRating(book.rating),
      publishedAt: toIsoOrNull(book.publishedAt),
      createdAt: toIsoOrNull(book.createdAt),
      genres: (book.genres ?? []).map((genre) => genre.name),
    })),
    ...(extra?.total !== undefined && { total: extra.total }),
    ...(extra?.referenceBook !== undefined && {
      referenceBook: extra.referenceBook,
    }),
    ...(extra?.message !== undefined && { message: extra.message }),
  });

const normalizeTitleForMatch = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const toToolBookCandidate = (
  book: BookWithGenres | SimilarBook,
  similarity?: number,
): ToolBookCandidate => ({
  id: book.id,
  title: book.title,
  author: book.author,
  description: book.description,
  coverUrl: book.coverUrl,
  rating: normalizeRating(book.rating),
  publishedAt: book.publishedAt,
  createdAt: book.createdAt,
  genres: (book.genres ?? []).map((g) => ({ slug: g.slug, name: g.name })),
  ...(similarity !== undefined && { similarity }),
});

export async function executeChatToolCall(
  toolCall: ChatCompletionMessageToolCall,
  deps?: ChatToolsDeps,
): Promise<ExecutedToolCallResult> {
  if (toolCall.type !== "function") {
    return formatToolError(
      toolCall.id,
      `Unsupported tool call type: ${toolCall.type}`,
    );
  }

  const { name, arguments: rawArguments } = toolCall.function;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawArguments);
  } catch {
    return formatToolError(
      toolCall.id,
      `Invalid JSON arguments for tool "${name}".`,
    );
  }

  try {
    switch (name) {
      case "searchSemanticBooks": {
        const parsedArgs = searchSemanticBooksArgsSchema.safeParse(parsedJson);
        if (!parsedArgs.success) {
          return formatToolError(
            toolCall.id,
            `Invalid arguments for tool "searchSemanticBooks".`,
            parsedArgs.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          );
        }

        const runSemanticSearch =
          deps?.searchSimilarBooks ?? searchSimilarBooks;
        const similarBooks = await runSemanticSearch(
          parsedArgs.data.query,
          parsedArgs.data.limit,
          SEMANTIC_MIN_SIMILARITY,
        );

        const candidates = similarBooks.map((book) =>
          toToolBookCandidate(book, book.similarity),
        );

        return {
          toolCallId: toolCall.id,
          content: serializeBooksForModel(candidates),
          books: candidates,
        };
      }

      case "searchBooks": {
        const parsedArgs = searchBooksArgsSchema.safeParse(parsedJson);
        if (!parsedArgs.success) {
          return formatToolError(
            toolCall.id,
            `Invalid arguments for tool "searchBooks".`,
            parsedArgs.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          );
        }

        const runListBooks = deps?.listBooks ?? listBooks;
        const { books, meta } = await runListBooks({
          search: parsedArgs.data.query,
          title: parsedArgs.data.title,
          author: parsedArgs.data.author,
          genre: parsedArgs.data.genre,
          minRating: parsedArgs.data.minRating,
          ...(parsedArgs.data.publishedAfter !== undefined && {
            publishedAfter: parsedArgs.data.publishedAfter,
          }),
          ...(parsedArgs.data.publishedBefore !== undefined && {
            publishedBefore: parsedArgs.data.publishedBefore,
          }),
          page: 1,
          limit: parsedArgs.data.limit,
          sortBy: parsedArgs.data.sortBy,
          order: parsedArgs.data.order,
        });

        const candidates = books.map((book) => toToolBookCandidate(book));
        const total =
          typeof meta?.total === "number" && Number.isFinite(meta.total)
            ? meta.total
            : undefined;

        return {
          toolCallId: toolCall.id,
          content: serializeBooksForModel(candidates, { total }),
          books: candidates,
        };
      }

      case "getCatalogStats": {
        const parsedArgs = getCatalogStatsArgsSchema.safeParse(parsedJson);
        if (!parsedArgs.success) {
          return formatToolError(
            toolCall.id,
            `Invalid arguments for tool "getCatalogStats".`,
            parsedArgs.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          );
        }

        const runGetCatalogStats = deps?.getCatalogStats ?? getCatalogStats;
        const stats = await runGetCatalogStats();

        return {
          toolCallId: toolCall.id,
          content: JSON.stringify({
            totalBooks: stats.totalBooks,
            averageRating: normalizeRating(stats.averageRating),
            booksByGenre: stats.booksByGenre,
            oldestPublishedAt: toIsoOrNull(stats.oldestPublishedAt),
            newestPublishedAt: toIsoOrNull(stats.newestPublishedAt),
          }),
          books: [],
        };
      }

      case "findSimilarBooks": {
        const parsedArgs = findSimilarBooksArgsSchema.safeParse(parsedJson);
        if (!parsedArgs.success) {
          return formatToolError(
            toolCall.id,
            `Invalid arguments for tool "findSimilarBooks".`,
            parsedArgs.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          );
        }

        let targetBookId = parsedArgs.data.bookId;

        if (!targetBookId && parsedArgs.data.title) {
          const runListBooks = deps?.listBooks ?? listBooks;
          const normalizedTitleInput = parsedArgs.data.title
            .trim()
            .replace(/\s+/g, " ");
          const normalizedTarget = normalizeTitleForMatch(normalizedTitleInput);

          const { books: titleBooks } = await runListBooks({
            title: normalizedTitleInput,
            page: 1,
            limit: 50,
            sortBy: "title",
            order: "asc",
          });

          let matchedBook = titleBooks.find(
            (book) => normalizeTitleForMatch(book.title) === normalizedTarget,
          );

          if (!matchedBook) {
            const { books: searchBooks } = await runListBooks({
              search: normalizedTitleInput,
              page: 1,
              limit: 20,
              order: "desc",
            });

            matchedBook =
              [...titleBooks, ...searchBooks].find(
                (book) =>
                  normalizeTitleForMatch(book.title) === normalizedTarget,
              ) ??
              titleBooks[0] ??
              searchBooks[0];
          }

          if (!matchedBook) {
            return {
              toolCallId: toolCall.id,
              content: JSON.stringify({
                books: [],
                message: "Livro de referência não encontrado no catálogo.",
              }),
              books: [],
            };
          }

          targetBookId = matchedBook.id;
        }

        if (!targetBookId) {
          return formatToolError(
            toolCall.id,
            `Invalid arguments for tool "findSimilarBooks".`,
            [
              {
                path: "",
                message: "Either bookId or title must be provided.",
              },
            ],
          );
        }

        const runFindSimilarByBookId =
          deps?.findSimilarBooksByBookId ?? findSimilarBooksByBookId;
        const result = await runFindSimilarByBookId(
          targetBookId,
          parsedArgs.data.limit,
          SEMANTIC_MIN_SIMILARITY,
        );

        if (result.status === "not_found") {
          return {
            toolCallId: toolCall.id,
            content: JSON.stringify({
              books: [],
              message: "Livro de referência não encontrado no catálogo.",
            }),
            books: [],
          };
        }

        if (result.status === "no_embedding") {
          return {
            toolCallId: toolCall.id,
            content: JSON.stringify({
              books: [],
              referenceBook: result.sourceBook,
              message:
                "O livro de referência ainda não possui índice de similaridade disponível no catálogo.",
            }),
            books: [],
          };
        }

        const candidates = result.books.map((book) =>
          toToolBookCandidate(book, book.similarity),
        );

        return {
          toolCallId: toolCall.id,
          content: serializeBooksForModel(candidates, {
            referenceBook: result.sourceBook,
            ...(candidates.length === 0 && {
              message:
                "Nenhum livro suficientemente similar foi encontrado no catálogo.",
            }),
          }),
          books: candidates,
        };
      }

      default:
        return formatToolError(toolCall.id, `Unknown tool "${name}".`);
    }
  } catch {
    return formatToolError(
      toolCall.id,
      "Temporary error while querying the book catalog.",
    );
  }
}
