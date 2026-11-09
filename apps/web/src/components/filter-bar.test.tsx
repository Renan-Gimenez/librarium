import "../test-setup";
import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterBar } from "./filter-bar";
import type { Genre } from "@/types/api";

const mockGenres: Genre[] = [
  {
    slug: "sci-fi",
    name: "Ficção Científica",
    createdAt: "2026-08-23T03:00:00.000Z",
    updatedAt: "2026-08-23T03:00:00.000Z",
  },
  {
    slug: "fantasy",
    name: "Fantasia",
    createdAt: "2026-08-23T03:00:00.000Z",
    updatedAt: "2026-08-23T03:00:00.000Z",
  },
  {
    slug: "history",
    name: "História",
    createdAt: "2026-08-23T03:00:00.000Z",
    updatedAt: "2026-08-23T03:00:00.000Z",
  },
];

describe("FilterBar component", () => {
  it("renders 'Todos' chip active by default when no genre is selected", () => {
    render(<FilterBar genres={mockGenres} />);

    const allChip = screen.getByRole("button", { name: "Todos" });
    expect(allChip.getAttribute("aria-pressed")).toBe("true");

    const sciFiChip = screen.getByRole("button", { name: "Ficção Científica" });
    expect(sciFiChip.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders active genre chip when selectedGenre is provided", () => {
    render(<FilterBar genres={mockGenres} selectedGenre="sci-fi" />);

    const allChip = screen.getByRole("button", { name: "Todos" });
    expect(allChip.getAttribute("aria-pressed")).toBe("false");

    const sciFiChip = screen.getByRole("button", { name: "Ficção Científica" });
    expect(sciFiChip.getAttribute("aria-pressed")).toBe("true");

    const fantasyChip = screen.getByRole("button", { name: "Fantasia" });
    expect(fantasyChip.getAttribute("aria-pressed")).toBe("false");
  });

  it("invokes onSelectGenre with slug when a genre is clicked", () => {
    let selectedSlug: string | undefined = "initial";

    render(
      <FilterBar
        genres={mockGenres}
        onSelectGenre={(slug) => {
          selectedSlug = slug;
        }}
      />,
    );

    const fantasyChip = screen.getByRole("button", { name: "Fantasia" });
    fireEvent.click(fantasyChip);

    expect(selectedSlug).toBe("fantasy");
  });

  it("toggles active genre chip off (emits undefined) when clicked again", () => {
    let selectedSlug: string | undefined = "sci-fi";

    render(
      <FilterBar
        genres={mockGenres}
        selectedGenre="sci-fi"
        onSelectGenre={(slug) => {
          selectedSlug = slug;
        }}
      />,
    );

    const sciFiChip = screen.getByRole("button", { name: "Ficção Científica" });
    fireEvent.click(sciFiChip);

    expect(selectedSlug).toBeUndefined();
  });

  it("invokes onSelectGenre with undefined when 'Todos' chip is clicked", () => {
    let selectedSlug: string | undefined = "sci-fi";

    render(
      <FilterBar
        genres={mockGenres}
        selectedGenre="sci-fi"
        onSelectGenre={(slug) => {
          selectedSlug = slug;
        }}
      />,
    );

    const allChip = screen.getByRole("button", { name: "Todos" });
    fireEvent.click(allChip);

    expect(selectedSlug).toBeUndefined();
  });

  it("reflects controlled values in sort and rating dropdowns", () => {
    render(
      <FilterBar
        sortBy="rating"
        sortOrder="desc"
        minRating={4}
      />,
    );

    const sortSelect = screen.getByLabelText("Critério de ordenação") as HTMLSelectElement;
    expect(sortSelect.value).toBe("rating_desc");

    const ratingSelect = screen.getByLabelText("Filtrar por avaliação mínima") as HTMLSelectElement;
    expect(ratingSelect.value).toBe("4");
  });

  it("invokes onMinRatingChange when rating dropdown changes", () => {
    let selectedRating: number | undefined;

    render(
      <FilterBar
        onMinRatingChange={(rating) => {
          selectedRating = rating;
        }}
      />,
    );

    const ratingSelect = screen.getByLabelText("Filtrar por avaliação mínima");
    fireEvent.change(ratingSelect, { target: { value: "4" } });

    expect(selectedRating).toBe(4);

    fireEvent.change(ratingSelect, { target: { value: "" } });
    expect(selectedRating).toBeUndefined();
  });

  it("invokes onSortChange when sort dropdown changes", () => {
    let sortKey: string | undefined;

    render(
      <FilterBar
        onSortChange={(by, order) => {
          sortKey = `${by}_${order}`;
        }}
      />,
    );

    const sortSelect = screen.getByLabelText("Critério de ordenação");
    fireEvent.change(sortSelect, { target: { value: "rating_desc" } });

    expect(sortKey).toBe("rating_desc");

    fireEvent.change(sortSelect, { target: { value: "title_asc" } });
    expect(sortKey).toBe("title_asc");
  });

  it("renders skeletons when isLoadingGenres is true", () => {
    const { container } = render(
      <FilterBar genres={mockGenres} isLoadingGenres={true} />,
    );

    // Genre items should not be present when loading
    expect(screen.queryByRole("button", { name: "Ficção Científica" })).toBeNull();

    // Skeletons should be present in the container
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders total books count when provided and ignores NaN or negative numbers", () => {
    const { rerender } = render(<FilterBar totalBooks={42} />);
    expect(screen.getByText("Exibindo 42 livros")).toBeDefined();

    rerender(<FilterBar totalBooks={1} />);
    expect(screen.getByText("Exibindo 1 livro")).toBeDefined();

    rerender(<FilterBar totalBooks={0} />);
    expect(screen.getByText("Nenhum livro encontrado")).toBeDefined();

    rerender(<FilterBar totalBooks={NaN} />);
    expect(screen.queryByText(/livro/i)).toBeNull();

    rerender(<FilterBar totalBooks={-5} />);
    expect(screen.queryByText(/livro/i)).toBeNull();
  });

  it("applies custom className", () => {
    const { container } = render(<FilterBar className="custom-test-class" />);
    expect(container.firstChild).not.toBeNull();
    expect((container.firstChild as HTMLElement).className).toContain("custom-test-class");
  });
});
