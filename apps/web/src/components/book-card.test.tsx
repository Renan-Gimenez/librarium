import { describe, expect, it, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookCard, BookCardSkeleton } from "./book-card";
import type { Book } from "@/types/api";

const mockBook: Book = {
  id: "book-1",
  title: "The Hitchhiker's Guide to the Galaxy",
  author: "Douglas Adams",
  description: "Seconds before the Earth is demolished to make way for a galactic freeway...",
  coverUrl: "https://example.com/cover.jpg",
  genres: [
    {
      slug: "fiction",
      name: "Fiction",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  rating: 4.8,
  publishedAt: "1979-10-12T00:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("BookCard Component", () => {
  it("renders book title, author, primary genre and rating correctly", () => {
    render(<BookCard book={mockBook} />);

    expect(screen.getByText("The Hitchhiker's Guide to the Galaxy")).toBeDefined();
    expect(screen.getByText("Douglas Adams")).toBeDefined();
    expect(screen.getByText("FICTION")).toBeDefined();
    expect(screen.getByText("4.8")).toBeDefined();
    expect(screen.getByText("1979")).toBeDefined();
  });

  it("renders cover image when coverUrl is provided", () => {
    render(<BookCard book={mockBook} />);
    const img = screen.getByRole("img", {
      name: "Capa do livro The Hitchhiker's Guide to the Galaxy",
    });
    expect(img).toBeDefined();
    expect(img.getAttribute("src")).toBe("https://example.com/cover.jpg");
  });

  it("renders fallback cover when coverUrl is null", () => {
    const bookWithoutCover = { ...mockBook, coverUrl: null };
    render(<BookCard book={bookWithoutCover} />);

    // Image shouldn't be present
    expect(screen.queryByRole("img")).toBeNull();
    // Fallback title displayed inside cover
    const titles = screen.getAllByText("The Hitchhiker's Guide to the Galaxy");
    expect(titles.length).toBeGreaterThan(1);
  });

  it("handles image error by switching to fallback cover", () => {
    render(<BookCard book={mockBook} />);
    const img = screen.getByRole("img", {
      name: "Capa do livro The Hitchhiker's Guide to the Galaxy",
    });
    fireEvent.error(img);

    // After error, image is replaced by fallback
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("calls onSelect when card is clicked", () => {
    const onSelect = mock();
    render(<BookCard book={mockBook} onSelect={onSelect} />);

    const card = screen.getByRole("button", {
      name: "Livro: The Hitchhiker's Guide to the Galaxy, por Douglas Adams",
    });
    fireEvent.click(card);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(mockBook);
  });

  it("calls onSelect on Enter and Space keys", () => {
    const onSelect = mock();
    render(<BookCard book={mockBook} onSelect={onSelect} />);

    const card = screen.getByRole("button", {
      name: "Livro: The Hitchhiker's Guide to the Galaxy, por Douglas Adams",
    });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(card, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("renders BookCardSkeleton with aria-hidden", () => {
    const { container } = render(<BookCardSkeleton className="custom-skeleton" />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton.className).toContain("custom-skeleton");
  });

  it("renders with role='article' when onSelect is not provided", () => {
    render(<BookCard book={mockBook} />);

    const article = screen.getByRole("article", {
      name: "Livro: The Hitchhiker's Guide to the Galaxy, por Douglas Adams",
    });
    expect(article).toBeDefined();
    expect(article.getAttribute("tabindex")).toBeNull();
  });

  it("handles missing rating, empty genres, and invalid publishedAt gracefully", () => {
    const incompleteBook: Book = {
      ...mockBook,
      rating: null,
      genres: [],
      publishedAt: "invalid-date-string",
    };

    render(<BookCard book={incompleteBook} />);

    // Rating star and year should not be rendered
    expect(screen.queryByText("4.8")).toBeNull();
    expect(screen.queryByText("1979")).toBeNull();
    // Primary genre should not be rendered
    expect(screen.queryByText("FICTION")).toBeNull();
    // Main elements still exist
    expect(screen.getByText("The Hitchhiker's Guide to the Galaxy")).toBeDefined();
  });

  it("ignores negative ratings, NaN, and ratings greater than 5", () => {
    const invalidRatingBook: Book = {
      ...mockBook,
      rating: -1,
    };
    const { rerender } = render(<BookCard book={invalidRatingBook} />);
    expect(screen.queryByText("-1.0")).toBeNull();

    rerender(<BookCard book={{ ...mockBook, rating: Number.NaN }} />);
    expect(screen.queryByText("NaN")).toBeNull();

    rerender(<BookCard book={{ ...mockBook, rating: 6 }} />);
    expect(screen.queryByText("6.0")).toBeNull();
  });

  it("handles whitespace coverUrl as no cover", () => {
    const whitespaceCoverBook: Book = {
      ...mockBook,
      coverUrl: "   ",
    };
    render(<BookCard book={whitespaceCoverBook} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("resets image error when coverUrl prop changes", () => {
    const { rerender } = render(<BookCard book={mockBook} />);
    const img = screen.getByRole("img");
    fireEvent.error(img);
    expect(screen.queryByRole("img")).toBeNull();

    // Rerender with a new coverUrl
    rerender(
      <BookCard
        book={{ ...mockBook, coverUrl: "https://example.com/new-cover.jpg" }}
      />,
    );
    const newImg = screen.getByRole("img");
    expect(newImg.getAttribute("src")).toBe("https://example.com/new-cover.jpg");
  });

  it("falls back to default texts when title or author are empty/whitespace", () => {
    const emptyFieldsBook: Book = {
      ...mockBook,
      title: "   ",
      author: "",
    };
    render(<BookCard book={emptyFieldsBook} />);
    expect(screen.getByText("Sem título")).toBeDefined();
    expect(screen.getByText("Autor desconhecido")).toBeDefined();
  });

  it("does not trigger onSelect on unhandled keys like Tab or Escape", () => {
    const onSelect = mock();
    render(<BookCard book={mockBook} onSelect={onSelect} />);

    const card = screen.getByRole("button");
    fireEvent.keyDown(card, { key: "Tab" });
    fireEvent.keyDown(card, { key: "Escape" });
    fireEvent.keyDown(card, { key: "ArrowDown" });

    expect(onSelect).not.toHaveBeenCalled();
  });
});

