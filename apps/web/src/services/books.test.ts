import { describe, expect, it, spyOn } from "bun:test";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

import { api } from "@/lib/api";
import { getBookById, getBooks, getGenres } from "./books";
import type {
  Book,
  Genre,
  PaginatedBooksResponse,
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
});
