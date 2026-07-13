import type { Book } from "../entities/book.entity";
import type { IBooksRepository, CreateBookInput } from "../repositories/books-repository.interface";

export class CreateBookUseCase {
  constructor(private booksRepository: IBooksRepository) {}

  async execute(data: CreateBookInput): Promise<Book> {
    return this.booksRepository.create(data);
  }
}
