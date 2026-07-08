import { prisma } from "../../../../lib/prisma";
import type { Book } from "../../../../routes/book/book.routes";
import type { IBooksRepository } from "../books-repository.interface";

export class PrismaBooksRepository implements IBooksRepository {
  async findMany(): Promise<Book[]> {
    return prisma.book.findMany();
  }
}
