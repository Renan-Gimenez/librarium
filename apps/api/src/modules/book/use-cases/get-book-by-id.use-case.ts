import type { Book } from "../entities/book.entity";
import type { IBooksRepository } from "../repositories/books-repository.interface";

export class GetBookByIdUseCase {
  constructor(private booksRepository: IBooksRepository) {}

  async execute(id: string): Promise<Book | null> {
    return this.booksRepository.findById(id);
  }
}
