import type { Book } from "../entities/book.entity";
import type { IBooksRepository, UpdateBookInput } from "../repositories/books-repository.interface";

export class UpdateBookUseCase {
  constructor(private booksRepository: IBooksRepository) {}

  async execute(id: string, data: UpdateBookInput): Promise<Book | null> {
    const bookExists = await this.booksRepository.findById(id);

    if (!bookExists) {
      return null;
    }

    return this.booksRepository.update(id, data);
  }
}
