import type { Book } from "../entities/book.entity";

export interface CreateBookInput {
  title: string;
  author: string;
  description?: string | null;
  coverUrl?: string | null;
  genreId: string;
  rating?: number | null;
  publishedAt?: Date | null;
}

export type UpdateBookInput = Partial<CreateBookInput>;

export interface IBooksRepository {
  findMany(filters?: {
    id?: string;
    title?: string;
    author?: string;
    description?: string;
    coverUrl?: string;
    genreId?: string;
    rating?: number;
    publishedAt?: Date;
  }): Promise<Book[]>;
  findById(id: string): Promise<Book | null>;
  create(data: CreateBookInput): Promise<Book>;
  update(id: string, data: UpdateBookInput): Promise<Book>;
  delete(id: string): Promise<void>;
}
