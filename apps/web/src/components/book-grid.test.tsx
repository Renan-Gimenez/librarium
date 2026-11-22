import { describe, expect, it, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookGrid } from "./book-grid";
import type { Book } from "@/types/api";

const mockBooks: Book[] = [
  {
    id: "1",
    title: "Dune",
    author: "Frank Herbert",
    description: "Desert planet",
    coverUrl: null,
    genres: [{ slug: "sci-fi", name: "Sci-Fi", createdAt: "", updatedAt: "" }],
    rating: 4.9,
    publishedAt: "1965-08-01T00:00:00Z",
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "2",
    title: "Neuromancer",
    author: "William Gibson",
    description: "Cyberpunk classic",
    coverUrl: "https://example.com/neuromancer.jpg",
    genres: [{ slug: "cyberpunk", name: "Cyberpunk", createdAt: "", updatedAt: "" }],
    rating: 4.7,
    publishedAt: "1984-07-01T00:00:00Z",
    createdAt: "",
    updatedAt: "",
  },
];

describe("BookGrid Component", () => {
  it("renders skeletons when isLoading is true", () => {
    const { container } = render(<BookGrid isLoading />);

    const status = screen.getByRole("status", {
      name: "Carregando catálogo de livros",
    });
    expect(status).toBeDefined();
    expect(status.getAttribute("aria-busy")).toBe("true");

    // By default, AC 1 requires at least 10 skeletons
    const skeletons = container.querySelectorAll("[aria-hidden='true']");
    expect(skeletons.length).toBeGreaterThanOrEqual(10);
  });

  it("renders empty state when books prop is undefined", () => {
    render(<BookGrid />);

    expect(screen.getByText("Nenhum livro encontrado")).toBeDefined();
  });

  it("renders error state with retry button when isError is true", () => {
    const onRetry = mock();
    render(<BookGrid isError onRetry={onRetry} />);

    expect(screen.getByText("Erro ao carregar os livros")).toBeDefined();
    const retryBtn = screen.getByRole("button", { name: "Tentar novamente" });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty state when books array is empty", () => {
    render(<BookGrid books={[]} searchQuery="unknown" hasFilters />);

    expect(screen.getByText("Nenhum livro encontrado")).toBeDefined();
  });

  it("renders list of books when loaded", () => {
    const onSelect = mock();
    render(<BookGrid books={mockBooks} onSelectBook={onSelect} />);

    expect(screen.getByRole("heading", { name: "Dune" })).toBeDefined();
    expect(screen.getAllByText("Frank Herbert").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Neuromancer" })).toBeDefined();
    expect(screen.getByText("William Gibson")).toBeDefined();

    const duneCard = screen.getByRole("button", {
      name: "Livro: Dune, por Frank Herbert",
    });
    fireEvent.click(duneCard);
    expect(onSelect).toHaveBeenCalledWith(mockBooks[0]);
  });

  it("handles negative or 0 skeletonCount safely without error", () => {
    const { container } = render(<BookGrid isLoading skeletonCount={-2} />);
    const status = screen.getByRole("status");
    expect(status).toBeDefined();
    expect(container.querySelectorAll(".custom-skeleton").length).toBe(0);
  });

  it("handles books with missing id gracefully", () => {
    const bookWithoutId = { ...mockBooks[0], id: "" };
    render(<BookGrid books={[bookWithoutId]} />);
    expect(screen.getByRole("heading", { name: "Dune" })).toBeDefined();
  });
});
