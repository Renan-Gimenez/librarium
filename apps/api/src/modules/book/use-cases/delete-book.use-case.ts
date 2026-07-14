import type { IBooksRepository } from "../repositories/books-repository.interface";

export class DeleteBookUseCase {
  constructor(private booksRepository: IBooksRepository) {}

  async execute(id: string): Promise<boolean> {
    const bookExists = await this.booksRepository.findById(id);

    if (!bookExists) {
      return false;
    }

    await this.booksRepository.delete(id);
    return true;
  }
}
