import type { Book, CitedBook } from "@/types/api";

export function toFullBook(cited: CitedBook): Book {
  return {
    id: cited.id,
    title: cited.title,
    author: cited.author,
    description: cited.description ?? null,
    coverUrl: cited.coverUrl ?? null,
    genres: (cited.genres ?? []).map((g) => ({
      slug: g.slug,
      name: g.name,
      createdAt: cited.createdAt ?? new Date().toISOString(),
      updatedAt: cited.updatedAt ?? new Date().toISOString(),
    })),
    rating: cited.rating ?? null,
    publishedAt: cited.publishedAt ?? null,
    createdAt: cited.createdAt ?? new Date().toISOString(),
    updatedAt: cited.updatedAt ?? new Date().toISOString(),
  };
}

