import "../test-setup";
import { describe, expect, it, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiCitationCard } from "./ai-citation-card";
import { toFullBook } from "@/lib/book-utils";
import type { CitedBook } from "@/types/api";

const mockCitedBook: CitedBook = {
  id: "book-123",
  title: "The Hitchhiker's Guide to the Galaxy",
  author: "Douglas Adams",
  description: "A comedy science fiction series.",
  coverUrl: "https://example.com/cover.jpg",
  rating: 4.5,
  similarity: 94,
  genres: [{ slug: "sci-fi", name: "Ficção Científica" }],
};

describe("AiCitationCard Component", () => {
  it("renders book details, rating, and match badge accurately", () => {
    render(<AiCitationCard book={mockCitedBook} />);

    expect(
      screen.getByText("The Hitchhiker's Guide to the Galaxy")
    ).toBeDefined();
    expect(screen.getByText("Douglas Adams")).toBeDefined();
    expect(screen.getByText("4.5")).toBeDefined();
    expect(screen.getByText("94% match")).toBeDefined();
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("handles fallback cover when coverUrl is null", () => {
    const bookWithoutCover = { ...mockCitedBook, coverUrl: null };
    render(<AiCitationCard book={bookWithoutCover} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("The Hitchh")).toBeDefined();
  });

  it("switches to fallback cover when image onError triggers", () => {
    render(<AiCitationCard book={mockCitedBook} />);

    const img = screen.getByRole("img");
    fireEvent.error(img);

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("invokes onSelect with a full Book object when clicked", () => {
    const onSelect = mock();
    render(<AiCitationCard book={mockCitedBook} onSelect={onSelect} />);

    const cardButton = screen.getByRole("button", {
      name: /Ver detalhes do livro/i,
    });
    fireEvent.click(cardButton);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const passedBook = onSelect.mock.calls[0][0];
    expect(passedBook.id).toBe("book-123");
    expect(passedBook.title).toBe("The Hitchhiker's Guide to the Galaxy");
    expect(passedBook.author).toBe("Douglas Adams");
    expect(passedBook.genres[0].slug).toBe("sci-fi");
  });

  it("toFullBook correctly converts a CitedBook into a Book instance", () => {
    const fullBook = toFullBook(mockCitedBook);
    expect(fullBook.id).toBe(mockCitedBook.id);
    expect(fullBook.title).toBe(mockCitedBook.title);
    expect(fullBook.rating).toBe(4.5);
    expect(Array.isArray(fullBook.genres)).toBe(true);
  });
});
