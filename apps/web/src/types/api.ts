export interface Genre {
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  genres: Genre[];
  rating: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

export type PaginatedBooksResponse = PaginatedResponse<Book>;

export interface SingleResponse<T> {
  data: T;
}

export type SingleBookResponse = SingleResponse<Book>;
export type GenresResponse = SingleResponse<Genre[]>;

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
}

export type BookSortBy = "title" | "author" | "rating" | "publishedAt" | "createdAt";
export type SortOrder = "asc" | "desc";

export interface BooksQueryParams {
  search?: string;
  title?: string;
  author?: string;
  genre?: string;
  minRating?: number;
  page?: number;
  limit?: number;
  sortBy?: BookSortBy;
  order?: SortOrder;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface ChatApiRequest {
  message: string;
}

export interface ChatApiResponse {
  data: {
    userMessage: string;
    modelReply: string;
  };
  meta: {
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}


