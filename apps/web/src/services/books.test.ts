import "@/test-setup";
import { describe, expect, it, spyOn } from "bun:test";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

import { api } from "@/lib/api";
import { bookKeys, useSimilarBooks } from "@/hooks/use-books";
import { getBookById, getBooks, getGenres, getSimilarBooks } from "./books";
import type {
  Book,
  Genre,
  PaginatedBooksResponse,
  SimilarBook,
  SimilarBooksResponse,
  SingleBookResponse,
} from "@/types/api";

const mockGenre: Genre = {
  slug: "sci-fi",
  name: "Science Fiction",
  createdAt: "2026-08-23T03:00:00.000Z",
  updatedAt: "2026-08-23T03:00:00.000Z",
};

const mockBook: Book = {
  id: "uuid-123",
  title: "Dune",
  author: "Frank Herbert",
  description: "Set on the desert planet Arrakis.",
  coverUrl: "https://example.com/dune.jpg",
  genres: [mockGenre],
  rating: 4.8,
  publishedAt: "1965-08-01T00:00:00.000Z",
  createdAt: "2026-08-23T03:00:00.000Z",
  updatedAt: "2026-08-23T03:00:00.000Z",
};

function createAxiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: {},
    config: { headers: {} } as unknown as InternalAxiosRequestConfig,
  };
}

describe("books service", () => {
  describe("getBooks", () => {
    it("should fetch paginated books with parameters", async () => {
      const mockResponse: PaginatedBooksResponse = {
        data: [mockBook],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      const result = await getBooks({ page: 1, limit: 10 });

      expect(getSpy).toHaveBeenCalledWith("/books", {
        params: { page: 1, limit: 10 },
        signal: undefined,
      });
      expect(result).toEqual(mockResponse);
      getSpy.mockRestore();
    });

    it("should filter out undefined, null and empty string parameters", async () => {
      const mockResponse: PaginatedBooksResponse = {
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      await getBooks({
        search: " dune  ",
        genre: "sci-fi",
        title: "   ",
        author: undefined,
        minRating: NaN,
      });

      expect(getSpy).toHaveBeenCalledWith("/books", {
        params: { search: "dune", genre: "sci-fi" },
        signal: undefined,
      });
      getSpy.mockRestore();
    });

    it("should pass undefined params when no filters are provided", async () => {
      const mockResponse: PaginatedBooksResponse = {
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      await getBooks();

      expect(getSpy).toHaveBeenCalledWith("/books", {
        params: undefined,
        signal: undefined,
      });
      getSpy.mockRestore();
    });

    it("should forward AbortSignal when provided", async () => {
      const mockResponse: PaginatedBooksResponse = {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      const controller = new AbortController();
      await getBooks({ page: 1 }, { signal: controller.signal });

      expect(getSpy).toHaveBeenCalledWith("/books", {
        params: { page: 1 },
        signal: controller.signal,
      });
      getSpy.mockRestore();
    });

    it("should propagate errors from axios", async () => {
      const networkError = new Error("Network Error");
      const getSpy = spyOn(api, "get").mockRejectedValueOnce(networkError);

      await expect(getBooks({ page: 1 })).rejects.toThrow("Network Error");
      getSpy.mockRestore();
    });
  });

  describe("getBookById", () => {
    it("should fetch a single book by id", async () => {
      const mockResponse: SingleBookResponse = {
        data: mockBook,
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      const result = await getBookById("uuid-123");

      expect(getSpy).toHaveBeenCalledWith("/books/uuid-123", {
        signal: undefined,
      });
      expect(result).toEqual(mockResponse);
      getSpy.mockRestore();
    });

    it("should throw an error if id is empty or whitespace", async () => {
      await expect(getBookById("   ")).rejects.toThrow(
        "A valid book ID is required",
      );
    });

    it("should encode URI components in book id", async () => {
      const mockResponse: SingleBookResponse = {
        data: mockBook,
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      await getBookById("special/book #1");

      expect(getSpy).toHaveBeenCalledWith("/books/special%2Fbook%20%231", {
        signal: undefined,
      });
      getSpy.mockRestore();
    });

    it("should propagate error when book is not found or request fails", async () => {
      const errorResponse = {
        response: {
          status: 404,
          data: { data: null },
        },
      };

      const getSpy = spyOn(api, "get").mockRejectedValueOnce(errorResponse);

      await expect(getBookById("non-existent-id")).rejects.toEqual(
        errorResponse,
      );
      getSpy.mockRestore();
    });
  });

  describe("getGenres", () => {
    it("should fetch genres list", async () => {
      const mockResponse = {
        data: [mockGenre],
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      const result = await getGenres();

      expect(getSpy).toHaveBeenCalledWith("/genres", {
        signal: undefined,
      });
      expect(result).toEqual(mockResponse);
      getSpy.mockRestore();
    });

    it("should forward AbortSignal to getGenres", async () => {
      const mockResponse = {
        data: [mockGenre],
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      const controller = new AbortController();
      await getGenres({ signal: controller.signal });

      expect(getSpy).toHaveBeenCalledWith("/genres", {
        signal: controller.signal,
      });
      getSpy.mockRestore();
    });

    it("should propagate errors when fetching genres fails", async () => {
      const errorResponse = new Error("Failed to load genres");
      const getSpy = spyOn(api, "get").mockRejectedValueOnce(errorResponse);

      await expect(getGenres()).rejects.toThrow("Failed to load genres");
      getSpy.mockRestore();
    });
  });

  describe("getSimilarBooks", () => {
    const mockSimilarBook: SimilarBook = {
      id: "uuid-456",
      title: "Dune Messiah",
      author: "Frank Herbert",
      description: "Sequel to Dune.",
      coverUrl: "https://example.com/messiah.jpg",
      genres: [{ slug: "sci-fi", name: "Science Fiction" }],
      rating: 4.5,
      publishedAt: "1969-10-15T00:00:00.000Z",
      createdAt: "2026-08-23T03:00:00.000Z",
      similarity: 92,
    };

    it("should fetch similar books by book id without options", async () => {
      const mockResponse: SimilarBooksResponse = {
        data: [mockSimilarBook],
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      const result = await getSimilarBooks("uuid-123");

      expect(getSpy).toHaveBeenCalledWith("/books/uuid-123/similar", {
        params: undefined,
        signal: undefined,
      });
      expect(result).toEqual(mockResponse);
      getSpy.mockRestore();
    });

    it("should forward limit and AbortSignal options", async () => {
      const mockResponse: SimilarBooksResponse = {
        data: [mockSimilarBook],
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      const controller = new AbortController();
      await getSimilarBooks("uuid-123", {
        limit: 4,
        signal: controller.signal,
      });

      expect(getSpy).toHaveBeenCalledWith("/books/uuid-123/similar", {
        params: { limit: 4 },
        signal: controller.signal,
      });
      getSpy.mockRestore();
    });

    it("should throw an error if id is empty or whitespace", async () => {
      await expect(getSimilarBooks("   ")).rejects.toThrow(
        "A valid book ID is required",
      );
    });

    it("should encode URI components in book id", async () => {
      const mockResponse: SimilarBooksResponse = {
        data: [],
      };

      const getSpy = spyOn(api, "get").mockResolvedValueOnce(
        createAxiosResponse(mockResponse),
      );

      await getSimilarBooks("special/book #1");

      expect(getSpy).toHaveBeenCalledWith(
        "/books/special%2Fbook%20%231/similar",
        {
          params: undefined,
          signal: undefined,
        },
      );
      getSpy.mockRestore();
    });

    it("should propagate errors when fetching similar books fails", async () => {
      const networkError = new Error("Failed to load similar books");
      const getSpy = spyOn(api, "get").mockRejectedValueOnce(networkError);

      await expect(getSimilarBooks("uuid-123")).rejects.toThrow(
        "Failed to load similar books",
      );
      getSpy.mockRestore();
    });
  });

  describe("useSimilarBooks hook and bookKeys", () => {
    it("should build deterministic query key via bookKeys.similar", () => {
      expect(bookKeys.similar("book-1")).toEqual([
        "books",
        "similar",
        "book-1",
        { limit: 4 },
      ]);
      expect(bookKeys.similar("book-1", 6)).toEqual([
        "books",
        "similar",
        "book-1",
        { limit: 6 },
      ]);
    });

    it("should fetch similar books for valid id and stay disabled for empty id", async () => {
      const mockResponse: SimilarBooksResponse = {
        data: [
          {
            id: "uuid-456",
            title: "Dune Messiah",
            author: "Frank Herbert",
            description: "Sequel to Dune.",
            coverUrl: null,
            genres: [{ slug: "sci-fi", name: "Science Fiction" }],
            rating: 4.5,
            publishedAt: "1969-10-15T00:00:00.000Z",
            createdAt: "2026-08-23T03:00:00.000Z",
            similarity: 89,
          },
        ],
      };

      const getSpy = spyOn(api, "get").mockResolvedValue(
        createAxiosResponse(mockResponse),
      );

      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children);

      const { result: disabledResult } = renderHook(
        () => useSimilarBooks("   "),
        { wrapper },
      );
      expect(disabledResult.current.fetchStatus).toBe("idle");
      expect(getSpy).not.toHaveBeenCalled();

      const { result } = renderHook(() => useSimilarBooks("uuid-123", 4), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy).toHaveBeenCalledWith(
        "/books/uuid-123/similar",
        expect.objectContaining({
          params: { limit: 4 },
        }),
      );
      expect(result.current.data).toEqual(mockResponse);

      getSpy.mockRestore();
    });
  });
});
