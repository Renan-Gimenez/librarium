import type {
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { z } from "zod";

import {
  DEFAULT_MIN_SIMILARITY,
  listBooks,
  searchSimilarBooks,
  type BookWithGenres,
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
    sortBy: nullToUndefined(
      z
        .enum(["title", "author", "rating", "publishedAt", "createdAt"])
        .default("createdAt"),
    ),
    order: nullToUndefined(z.enum(["asc", "desc"]).default("desc")),
    limit: nullToUndefined(z.number().int().min(1).max(20).default(5)),
  })
  .strict();

export type SearchSemanticBooksArgs = z.infer<
  typeof searchSemanticBooksArgsSchema
>;
export type SearchBooksArgs = z.infer<typeof searchBooksArgsSchema>;

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
        "Busca estruturada no acervo por título, autor, gênero (slug ou nome), nota mínima ou ordenação. Use para filtros objetivos, rankings por nota e novidades.",
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
  total?: number,
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
    ...(total !== undefined && { total }),
  });

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
          content: serializeBooksForModel(candidates, total),
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
