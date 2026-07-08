import type { Book } from "../../../routes/book/book.routes";

export interface IBooksRepository {
  findMany(): Promise<Book[]>;
}
