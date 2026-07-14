import { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../../../lib/prisma";
import type { Book } from "../../entities/book.entity";
import type { IBooksRepository, CreateBookInput, UpdateBookInput } from "../books-repository.interface";

export class PrismaBooksRepository implements IBooksRepository {
  async findMany(filters: {
    id?: string;
    title?: string;
    author?: string;
    description?: string;
    coverUrl?: string;
    genreId?: string;
    rating?: number;
    publishedAt?: Date;
  } = {}): Promise<Book[]> {
    const { id, title, author, description, coverUrl, genreId, rating, publishedAt } = filters;

    const where: Prisma.BookWhereInput = {
      id,
      title: title ? { contains: title, mode: "insensitive" } : undefined,
      author: author ? { contains: author, mode: "insensitive" } : undefined,
      description: description ? { contains: description, mode: "insensitive" } : undefined,
      coverUrl: coverUrl ? { contains: coverUrl, mode: "insensitive" } : undefined,
      genreId,
      rating,
      publishedAt,
    };

    return prisma.book.findMany({ where });
  }

  async findById(id: string): Promise<Book | null> {
    return prisma.book.findUnique({
      where: { id },
    });
  }

  async create(data: CreateBookInput): Promise<Book> {
    return prisma.book.create({
      data,
    });
  }

  async update(id: string, data: UpdateBookInput): Promise<Book> {
    return prisma.book.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.book.delete({
      where: { id },
    });
  }
}
