import type { Book } from "../../../routes/book/book.routes";

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
}
