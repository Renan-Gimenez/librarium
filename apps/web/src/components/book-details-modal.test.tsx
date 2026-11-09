import { describe, expect, it, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookDetailsModal } from "./book-details-modal";
import type { Book } from "@/types/api";

const mockBook: Book = {
  id: "book-1",
  title: "Clean Code",
  author: "Robert C. Martin",
  description:
    "Even bad code can function. But if code isn't clean, it can bring a development organization to its knees.",
  coverUrl: "https://example.com/cleancode.jpg",
  genres: [
    {
      slug: "technology",
      name: "Tecnologia",
      createdAt: "",
      updatedAt: "",
    },
  ],
  rating: 4.6,
  publishedAt: "2008-08-01T00:00:00Z",
  createdAt: "",
  updatedAt: "",
};

describe("BookDetailsModal Component", () => {
  it("returns null when book is null", () => {
    const { container } = render(
      <BookDetailsModal book={null} isOpen={true} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal with book details, cover, metadata, and synopsis", () => {
    render(
      <BookDetailsModal book={mockBook} isOpen={true} onClose={() => {}} />
    );

    expect(screen.getByRole("heading", { name: "Clean Code" })).toBeDefined();
    expect(screen.getByText("Robert C. Martin")).toBeDefined();
    expect(screen.getByText("TECNOLOGIA")).toBeDefined();
    expect(screen.getByText("4.6 / 5.0")).toBeDefined();
    expect(screen.getByText(/Even bad code can function/i)).toBeDefined();
    expect(
      screen.getByRole("img", { name: "Capa do livro Clean Code" })
    ).toBeDefined();
  });

  it("renders fallback cover when coverUrl is null", () => {
    const bookWithoutCover = { ...mockBook, coverUrl: null };
    render(
      <BookDetailsModal book={bookWithoutCover} isOpen={true} onClose={() => {}} />
    );

    expect(
      screen.queryByRole("img", { name: "Capa do livro Clean Code" })
    ).toBeNull();
    // Fallback title should be present
    const titles = screen.getAllByText("Clean Code");
    expect(titles.length).toBeGreaterThan(1);
  });

  it("invokes onClose when clicking a close button", () => {
    const onClose = mock();
    render(
      <BookDetailsModal book={mockBook} isOpen={true} onClose={onClose} />
    );

    const closeButtons = screen.getAllByRole("button", { name: "Fechar" });
    expect(closeButtons.length).toBeGreaterThan(0);
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onAskAI when clicking the AI CTA button", () => {
    const onAskAI = mock();
    const onClose = mock();
    render(
      <BookDetailsModal
        book={mockBook}
        isOpen={true}
        onClose={onClose}
        onAskAI={onAskAI}
      />
    );

    const aiBtn = screen.getByRole("button", {
      name: "Perguntar à IA sobre este livro",
    });
    fireEvent.click(aiBtn);
    expect(onAskAI).toHaveBeenCalledTimes(1);
    expect(onAskAI).toHaveBeenCalledWith(mockBook);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes modal on Escape key press", () => {
    const onClose = mock();
    render(
      <BookDetailsModal book={mockBook} isOpen={true} onClose={onClose} />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes modal when clicking the backdrop overlay", () => {
    const onClose = mock();
    render(
      <BookDetailsModal book={mockBook} isOpen={true} onClose={onClose} />
    );

    const overlay = screen.getByTestId("dialog-overlay");
    expect(overlay).toBeDefined();
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switches to fallback cover when cover image fails to load", () => {
    render(
      <BookDetailsModal book={mockBook} isOpen={true} onClose={() => {}} />
    );

    const img = screen.getByRole("img", { name: "Capa do livro Clean Code" });
    fireEvent.error(img);

    // After error, image should disappear and fallback cover should be rendered
    expect(
      screen.queryByRole("img", { name: "Capa do livro Clean Code" })
    ).toBeNull();
    const titles = screen.getAllByText("Clean Code");
    expect(titles.length).toBeGreaterThan(1);
  });

  it("handles book with missing or null attributes gracefully", () => {
    const minimalBook: Book = {
      id: "book-min",
      title: "Livro Sem Metadados",
      author: "Autor Desconhecido",
      description: null,
      coverUrl: null,
      genres: [],
      rating: null,
      publishedAt: null,
      createdAt: "",
      updatedAt: "",
    };

    render(
      <BookDetailsModal book={minimalBook} isOpen={true} onClose={() => {}} />
    );

    expect(
      screen.getByRole("heading", { name: "Livro Sem Metadados" })
    ).toBeDefined();
    const authors = screen.getAllByText("Autor Desconhecido");
    expect(authors.length).toBeGreaterThan(0);
    expect(screen.getByText("Geral")).toBeDefined();
    expect(screen.getByText("Sem nota")).toBeDefined();
    expect(screen.getByText("Desconhecido")).toBeDefined();
    expect(
      screen.getByText("Nenhuma sinopse disponível para esta obra.")
    ).toBeDefined();
  });
});
