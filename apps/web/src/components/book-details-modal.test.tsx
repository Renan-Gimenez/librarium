import "../test-setup";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import * as React from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BookDetailsModal } from "./book-details-modal";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { Book, SimilarBook } from "@/types/api";

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

const makeSimilarBook = (overrides: Partial<SimilarBook> = {}): SimilarBook => ({
  id: "sim-1",
  title: "The Pragmatic Programmer",
  author: "Andrew Hunt",
  description: "From journeyman to master.",
  coverUrl: "https://example.com/pragmatic.jpg",
  genres: [{ slug: "technology", name: "Tecnologia" }],
  rating: 4.8,
  publishedAt: "1999-10-20T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  similarity: 91,
  ...overrides,
});

function createAxiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} } as unknown as InternalAxiosRequestConfig,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return {
    ...render(ui, { wrapper: Wrapper }),
    client,
  };
}

describe("BookDetailsModal Component", () => {
  let apiGetSpy: ReturnType<typeof spyOn<typeof api, "get">> | undefined;

  beforeEach(() => {
    apiGetSpy = spyOn(api, "get").mockResolvedValue(
      createAxiosResponse({ data: [] }),
    );
  });

  afterEach(() => {
    apiGetSpy?.mockRestore();
  });

  it("returns null when book is null", () => {
    const { container } = renderWithClient(
      <BookDetailsModal book={null} isOpen={true} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal with book details, cover, metadata, and synopsis", () => {
    renderWithClient(
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
    renderWithClient(
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
    renderWithClient(
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
    renderWithClient(
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
    renderWithClient(
      <BookDetailsModal book={mockBook} isOpen={true} onClose={onClose} />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes modal when clicking the backdrop overlay", () => {
    const onClose = mock();
    renderWithClient(
      <BookDetailsModal book={mockBook} isOpen={true} onClose={onClose} />
    );

    const overlay = screen.getByTestId("dialog-overlay");
    expect(overlay).toBeDefined();
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switches to fallback cover when cover image fails to load", () => {
    renderWithClient(
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

    renderWithClient(
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

  it("shows subtle skeletons under 'Livros parecidos' while loading similar books", async () => {
    let resolveSimilar!: (value: AxiosResponse<{ data: SimilarBook[] }>) => void;
    apiGetSpy?.mockImplementationOnce(
      (() =>
        new Promise((resolve) => {
          resolveSimilar = resolve;
        })) as unknown as typeof api.get,
    );

    renderWithClient(
      <BookDetailsModal book={mockBook} isOpen={true} onClose={() => {}} />
    );

    expect(
      await screen.findByRole("heading", { name: "Livros parecidos" })
    ).toBeDefined();
    expect(screen.getByTestId("similar-books-skeleton")).toBeDefined();

    await act(async () => {
      resolveSimilar(createAxiosResponse({ data: [] }));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("similar-books-skeleton") === null).toBe(true);
      expect(
        screen.queryByRole("heading", { name: "Livros parecidos" }) === null,
      ).toBe(true);
    });
  });

  it("renders up to 4 clickable similar book cards with cover/fallback, title, author, rating, and similarity", async () => {
    const similarItems: SimilarBook[] = [
      makeSimilarBook({
        id: "sim-1",
        title: "The Pragmatic Programmer",
        author: "Andrew Hunt",
        coverUrl: "https://example.com/pragmatic.jpg",
        rating: 4.8,
        similarity: 92,
      }),
      makeSimilarBook({
        id: "sim-2",
        title: "Refactoring",
        author: "Martin Fowler",
        coverUrl: null,
        rating: 4.7,
        similarity: 85,
      }),
      makeSimilarBook({
        id: "sim-3",
        title: "Clean Architecture",
        author: "Robert C. Martin",
        coverUrl: "https://example.com/arch.jpg",
        rating: 4.5,
        similarity: 80,
      }),
      makeSimilarBook({
        id: "sim-4",
        title: "Design Patterns",
        author: "Erich Gamma",
        coverUrl: "https://example.com/gof.jpg",
        rating: 4.6,
        similarity: 77,
      }),
      makeSimilarBook({
        id: "sim-5",
        title: "Hidden Fifth Book",
        author: "Ignored Author",
        similarity: 60,
      }),
    ];

    apiGetSpy?.mockResolvedValueOnce(
      createAxiosResponse({ data: similarItems }),
    );

    renderWithClient(
      <BookDetailsModal book={mockBook} isOpen={true} onClose={() => {}} />
    );

    expect(
      await screen.findByRole("heading", { name: "Livros parecidos" })
    ).toBeDefined();

    expect(
      await screen.findByText("The Pragmatic Programmer")
    ).toBeDefined();
    expect(screen.getByText("Andrew Hunt")).toBeDefined();
    expect(screen.getByText("4.8")).toBeDefined();
    expect(screen.getByText("92% similar")).toBeDefined();

    // Null cover renders fallback
    expect(screen.getByTestId("similar-book-fallback-sim-2")).toBeDefined();

    // Error on similar card image switches to fallback
    const pragmaticImg = screen.getByRole("img", {
      name: "Capa do livro The Pragmatic Programmer",
    });
    fireEvent.error(pragmaticImg);
    expect(screen.getByTestId("similar-book-fallback-sim-1")).toBeDefined();

    // Capped at 4 items
    expect(screen.getByText("Design Patterns")).toBeDefined();
    expect(screen.queryByText("Hidden Fifth Book")).toBeNull();
  });

  it("silently hides 'Livros parecidos' section when similar books list is empty or request fails", async () => {
    apiGetSpy?.mockResolvedValueOnce(createAxiosResponse({ data: [] }));

    const { rerender } = renderWithClient(
      <BookDetailsModal book={mockBook} isOpen={true} onClose={() => {}} />
    );

    await waitFor(() => {
      expect(apiGetSpy).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole("heading", { name: "Livros parecidos" }) === null,
      ).toBe(true);
    });

    apiGetSpy?.mockRejectedValueOnce(new Error("Network error"));

    rerender(
      <BookDetailsModal
        book={{ ...mockBook, id: "book-error" }}
        isOpen={true}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(apiGetSpy).toHaveBeenCalledTimes(2);
      expect(
        screen.queryByRole("heading", { name: "Livros parecidos" }) === null,
      ).toBe(true);
    });
    expect(screen.queryByRole("alert") === null).toBe(true);
  });

  it("maps SimilarBook to Book on click, smoothly scrolls internal containers to top, and never calls window.scrollTo", async () => {
    const windowScrollSpy = spyOn(window, "scrollTo").mockImplementation(() => {});
    const similar = makeSimilarBook({
      id: "sim-next",
      title: "Refactoring",
      author: "Martin Fowler",
      description: "Improving the design of existing code.",
      coverUrl: "https://example.com/refactoring.jpg",
      genres: [{ slug: "architecture", name: "Arquitetura" }],
      rating: 4.9,
      publishedAt: "1999-07-08T00:00:00.000Z",
      createdAt: "2026-02-10T00:00:00.000Z",
      similarity: 94,
    });

    apiGetSpy?.mockImplementation(((url: string) => {
      if (url.includes("/books/book-1/similar")) {
        return Promise.resolve(createAxiosResponse({ data: [similar] }));
      }
      return Promise.resolve(createAxiosResponse({ data: [] }));
    }) as unknown as typeof api.get);

    const onSelectBook = mock();

    function ControlledModal() {
      const [currentBook, setCurrentBook] = React.useState<Book>(mockBook);
      return (
        <BookDetailsModal
          book={currentBook}
          isOpen={true}
          onClose={() => {}}
          onSelectBook={(nextBook) => {
            onSelectBook(nextBook);
            setCurrentBook(nextBook);
          }}
        />
      );
    }

    renderWithClient(<ControlledModal />);

    const cardBtn = await screen.findByRole("button", {
      name: "Ver detalhes do livro Refactoring, por Martin Fowler",
    });

    const detailsPanel = screen.getByTestId("book-details-panel");
    const modalScrollContainer = screen.getByTestId(
      "book-details-scroll-container",
    );
    const panelScrollSpy = mock(() => {});
    const bodyScrollSpy = mock(() => {});
    detailsPanel.scrollTo = panelScrollSpy as unknown as typeof detailsPanel.scrollTo;
    modalScrollContainer.scrollTo = bodyScrollSpy as unknown as typeof modalScrollContainer.scrollTo;

    fireEvent.click(cardBtn);

    expect(onSelectBook).toHaveBeenCalledTimes(1);
    expect(onSelectBook).toHaveBeenCalledWith({
      id: "sim-next",
      title: "Refactoring",
      author: "Martin Fowler",
      description: "Improving the design of existing code.",
      coverUrl: "https://example.com/refactoring.jpg",
      genres: [
        {
          slug: "architecture",
          name: "Arquitetura",
          createdAt: "",
          updatedAt: "",
        },
      ],
      rating: 4.9,
      publishedAt: "1999-07-08T00:00:00.000Z",
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    });

    expect(
      await screen.findByRole("heading", { name: "Refactoring" })
    ).toBeDefined();
    expect(screen.getByText("Improving the design of existing code.")).toBeDefined();
    expect(panelScrollSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(bodyScrollSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(windowScrollSpy).not.toHaveBeenCalled();

    windowScrollSpy.mockRestore();
  });

  it("falls back to setting scrollTop = 0 when element.scrollTo is unavailable", async () => {
    const similar = makeSimilarBook({
      id: "sim-fallback-scroll",
      title: "Domain-Driven Design",
      author: "Eric Evans",
    });

    apiGetSpy?.mockImplementation(((url: string) => {
      if (url.includes("/books/book-1/similar")) {
        return Promise.resolve(createAxiosResponse({ data: [similar] }));
      }
      return Promise.resolve(createAxiosResponse({ data: [] }));
    }) as unknown as typeof api.get);

    function ControlledModal() {
      const [currentBook, setCurrentBook] = React.useState<Book>(mockBook);
      return (
        <BookDetailsModal
          book={currentBook}
          isOpen={true}
          onClose={() => {}}
          onSelectBook={setCurrentBook}
        />
      );
    }

    renderWithClient(<ControlledModal />);

    const cardBtn = await screen.findByRole("button", {
      name: "Ver detalhes do livro Domain-Driven Design, por Eric Evans",
    });

    const detailsPanel = screen.getByTestId("book-details-panel");
    Object.defineProperty(detailsPanel, "scrollTo", {
      value: undefined,
      configurable: true,
    });
    detailsPanel.scrollTop = 240;

    fireEvent.click(cardBtn);

    expect(
      await screen.findByRole("heading", { name: "Domain-Driven Design" })
    ).toBeDefined();
    expect(detailsPanel.scrollTop).toBe(0);
  });
});
