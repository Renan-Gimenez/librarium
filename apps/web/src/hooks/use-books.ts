import {
  keepPreviousData,
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { getBookById, getBooks, getGenres, getSimilarBooks } from "@/services/books";
import type {
  BooksQueryParams,
  GenresResponse,
  PaginatedBooksResponse,
  SimilarBooksResponse,
  SingleBookResponse,
} from "@/types/api";

export const bookKeys = {
  all: ["books"] as const,
  lists: () => [...bookKeys.all, "list"] as const,
  list: (params?: BooksQueryParams) =>
    [
      ...bookKeys.lists(),
      params
        ? Object.fromEntries(
            Object.entries(params).filter(
              ([, v]) =>
                v !== undefined &&
                v !== null &&
                (typeof v !== "string" || v.trim() !== ""),
            ),
          )
        : {},
    ] as const,
  details: () => [...bookKeys.all, "detail"] as const,
  detail: (id: string) => [...bookKeys.details(), id] as const,
  similars: () => [...bookKeys.all, "similar"] as const,
  similar: (id: string, limit = 4) =>
    [...bookKeys.similars(), id, { limit }] as const,
  genres: () => ["genres"] as const,
};

export function useBooks(
  params?: BooksQueryParams,
  options?: Omit<
    UseQueryOptions<PaginatedBooksResponse, Error>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    placeholderData: keepPreviousData,
    ...options,
    queryKey: bookKeys.list(params),
    queryFn: ({ signal }) => getBooks(params, { signal }),
  });
}

export function useBook(
  id?: string,
  options?: Omit<
    UseQueryOptions<SingleBookResponse, Error>,
    "queryKey" | "queryFn"
  >,
) {
  const normalizedId = id?.trim() || "";

  return useQuery({
    ...options,
    queryKey: bookKeys.detail(normalizedId),
    queryFn: ({ signal }) => getBookById(normalizedId, { signal }),
    enabled: Boolean(normalizedId) && (options?.enabled ?? true),
  });
}

export function useSimilarBooks(
  id?: string,
  limit = 4,
  options?: Omit<
    UseQueryOptions<SimilarBooksResponse, Error>,
    "queryKey" | "queryFn"
  >,
) {
  const normalizedId = id?.trim() || "";

  return useQuery({
    retry: false,
    ...options,
    queryKey: bookKeys.similar(normalizedId, limit),
    queryFn: ({ signal }) => getSimilarBooks(normalizedId, { limit, signal }),
    enabled: Boolean(normalizedId) && (options?.enabled ?? true),
  });
}

export function useGenres(
  options?: Omit<
    UseQueryOptions<GenresResponse, Error>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    ...options,
    queryKey: bookKeys.genres(),
    queryFn: ({ signal }) => getGenres({ signal }),
  });
}

