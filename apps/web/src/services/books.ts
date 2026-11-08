import { api } from "@/lib/api";
import type {
  BooksQueryParams,
  GenresResponse,
  PaginatedBooksResponse,
  SingleBookResponse,
} from "@/types/api";

export interface RequestOptions {
  signal?: AbortSignal;
}

export async function getBooks(
  params?: BooksQueryParams,
  options?: RequestOptions,
): Promise<PaginatedBooksResponse> {
  const cleanParams: Record<string, string | number> = {};

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          cleanParams[key] = trimmed;
        }
      } else if (typeof value === "number") {
        if (!Number.isNaN(value)) {
          cleanParams[key] = value;
        }
      } else if (value !== undefined && value !== null) {
        cleanParams[key] = value;
      }
    }
  }

  const response = await api.get<PaginatedBooksResponse>("/books", {
    params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
    signal: options?.signal,
  });

  return response.data;
}

export async function getBookById(
  id: string,
  options?: RequestOptions,
): Promise<SingleBookResponse> {
  const trimmed = id?.trim();
  if (!trimmed) {
    throw new Error("A valid book ID is required");
  }

  const response = await api.get<SingleBookResponse>(
    `/books/${encodeURIComponent(trimmed)}`,
    {
      signal: options?.signal,
    },
  );
  return response.data;
}

export async function getGenres(
  options?: RequestOptions,
): Promise<GenresResponse> {
  const response = await api.get<GenresResponse>("/genres", {
    signal: options?.signal,
  });
  return response.data;
}

