import type { Book } from "../../../routes/book/book.routes";
import type { IBooksRepository } from "../repositories/books-repository.interface";

export interface SearchBooksQueryDTO {
  id?: string;
  title?: string;
  author?: string;
  description?: string;
  coverUrl?: string;
  genreId?: string;
  rating?: number;
  publishedAt?: Date;
}

export class ListBooksUseCase {
  constructor(private booksRepository: IBooksRepository) {}

  async execute({
    id,
    title,
    author,
    description,
    coverUrl,
    genreId,
    rating,
    publishedAt,
  }: SearchBooksQueryDTO = {}): Promise<Book[]> {
    return this.booksRepository.findMany({
      id,
      title,
      author,
      description,
      coverUrl,
      genreId,
      rating,
      publishedAt,
    });
  }
}
