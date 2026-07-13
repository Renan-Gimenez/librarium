export interface Book {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  genreId: string;
  rating: number | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
