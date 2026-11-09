import "./test-setup";
import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { api } from "./lib/api";
import type { Book, Genre, PaginatedBooksResponse } from "./types/api";

const mockGenresList: Genre[] = [
  {
    slug: "sci-fi",
    name: "Ficção Científica",
    createdAt: "2026-08-23T03:00:00.000Z",
    updatedAt: "2026-08-23T03:00:00.000Z",
  },
];

const mockBooksList: Book[] = [
  {
    id: "1",
    title: "Duna",
    author: "Frank Herbert",
    description: "Um clássico épico de ficção científica.",
    coverUrl: "https://example.com/duna.jpg",
    genres: [
      {
        slug: "sci-fi",
        name: "Ficção Científica",
        createdAt: "2026-08-23T03:00:00.000Z",
        updatedAt: "2026-08-23T03:00:00.000Z",
      },
    ],
    rating: 4.9,
    publishedAt: "1965-08-01T00:00:00.000Z",
    createdAt: "2026-08-23T03:00:00.000Z",
    updatedAt: "2026-08-23T03:00:00.000Z",
  },
  {
    id: "2",
    title: "Fundação",
    author: "Isaac Asimov",
    description: "A queda do Império Galáctico.",
    coverUrl: null,
    genres: [
      {
        slug: "sci-fi",
        name: "Ficção Científica",
        createdAt: "2026-08-23T03:00:00.000Z",
        updatedAt: "2026-08-23T03:00:00.000Z",
      },
    ],
    rating: 4.8,
    publishedAt: "1951-05-01T00:00:00.000Z",
    createdAt: "2026-08-23T03:00:00.000Z",
    updatedAt: "2026-08-23T03:00:00.000Z",
  },
];

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

describe("App component integration", () => {
  let mockBooksResponse: PaginatedBooksResponse;

  beforeEach(() => {
    mockBooksResponse = {
      data: mockBooksList,
      meta: {
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    };

    spyOn(api, "get").mockImplementation(((url: string) => {
      if (url.includes("/genres")) {
        return Promise.resolve(createAxiosResponse({ data: mockGenresList }));
      }
      if (url.includes("/books")) {
        return Promise.resolve(createAxiosResponse(mockBooksResponse));
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    }) as unknown as typeof api.get);
  });

  it("renders header, filter bar and catalogue grid with books", async () => {
    renderWithClient(<App />);

    expect(screen.getByText("Librarium")).toBeDefined();
    expect(screen.getByText("Assistente IA")).toBeDefined();
    expect(screen.getByRole("button", { name: "Todos" })).toBeDefined();

    // Wait for books and total count to resolve
    expect(await screen.findByRole("heading", { name: "Duna" })).toBeDefined();
    expect(await screen.findByRole("heading", { name: "Fundação" })).toBeDefined();
    expect(await screen.findByText("Frank Herbert")).toBeDefined();
    expect(await screen.findByText(/Exibindo 2 livros/i)).toBeDefined();
  });

  it("renders pagination when totalPages > 1", async () => {
    mockBooksResponse = {
      data: mockBooksList,
      meta: {
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
      },
    };

    renderWithClient(<App />);

    expect(
      await screen.findByRole("navigation", { name: "Paginação do catálogo" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Ir para a página 1" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Ir para a página 2" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Ir para a página 3" })).toBeDefined();
  });

  it("renders empty state when book list is empty", async () => {
    mockBooksResponse = {
      data: [],
      meta: {
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      },
    };

    renderWithClient(<App />);

    expect(
      await screen.findByRole("heading", { name: "Nenhum livro encontrado" }),
    ).toBeDefined();
  });

  it("toggles the assistant drawer when clicking the AI button", async () => {
    renderWithClient(<App />);

    // Wait for content
    await screen.findByRole("heading", { name: "Duna" });

    expect(screen.queryByText("Assistente Literário")).toBeNull();

    const assistantBtn = screen.getByLabelText(
      "Abrir assistente literário com inteligência artificial",
    );
    fireEvent.click(assistantBtn);

    expect(screen.getByText("Assistente Literário")).toBeDefined();
    expect(screen.getByText("Consultor do acervo · IA")).toBeDefined();

    const closeBtn = screen.getByRole("button", { name: "Fechar assistente" });
    fireEvent.click(closeBtn);
    expect(screen.queryByText("Assistente Literário")).toBeNull();
  });

  it("propagates search input and debounces properly", async () => {
    renderWithClient(<App />);

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );
    fireEvent.change(input, { target: { value: "Neuromancer" } });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(input.getAttribute("value")).toBe("Neuromancer");
  });

  it("updates page when clicking a page button in pagination", async () => {
    mockBooksResponse = {
      data: mockBooksList,
      meta: {
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
      },
    };

    renderWithClient(<App />);

    const page2Btn = await screen.findByRole("button", { name: "Ir para a página 2" });
    fireEvent.click(page2Btn);

    expect(page2Btn.getAttribute("aria-current")).toBe("page");
  });

  it("filters by genre when a genre chip is clicked", async () => {
    renderWithClient(<App />);

    const genreChip = await screen.findByRole("button", { name: "Ficção Científica" });
    fireEvent.click(genreChip);

    expect(genreChip.getAttribute("aria-pressed")).toBe("true");
  });

  it("clears filters and search query when clicking clear filters in empty state", async () => {
    mockBooksResponse = {
      data: [],
      meta: {
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      },
    };

    renderWithClient(<App />);

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );
    fireEvent.change(input, { target: { value: "inexistente" } });

    const clearBtn = await screen.findByRole("button", { name: "Limpar filtros" });
    fireEvent.click(clearBtn);

    expect(input.getAttribute("value")).toBe("");
  });

  it("handles book selection when a book card is clicked and opens BookDetailsModal", async () => {
    renderWithClient(<App />);

    const dunaCard = await screen.findByRole("button", {
      name: "Livro: Duna, por Frank Herbert",
    });
    fireEvent.click(dunaCard);

    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByText("Um clássico épico de ficção científica.")).toBeDefined();

    const closeButtons = screen.getAllByRole("button", { name: "Fechar" });
    fireEvent.click(closeButtons[0]);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens AI assistant and closes modal when clicking 'Perguntar à IA' inside modal", async () => {
    renderWithClient(<App />);

    const dunaCard = await screen.findByRole("button", {
      name: "Livro: Duna, por Frank Herbert",
    });
    fireEvent.click(dunaCard);

    expect(
      (await screen.findAllByRole("heading", { name: "Duna" })).length
    ).toBeGreaterThan(1);

    const askAIBtn = screen.getByRole("button", {
      name: "Perguntar à IA sobre este livro",
    });
    fireEvent.click(askAIBtn);

    // Chat Drawer should be visible with pre-populated prompt
    expect(screen.getByText("Assistente Literário")).toBeDefined();
    const chatInput = screen.getByPlaceholderText(
      "Pergunte sobre o acervo..."
    ) as HTMLInputElement;
    expect(chatInput.value).toContain("Duna");
  });

  it("handles sort order and min rating dropdown changes", async () => {
    renderWithClient(<App />);

    await screen.findByRole("heading", { name: "Duna" });

    const ratingSelect = screen.getByLabelText("Filtrar por avaliação mínima");
    fireEvent.change(ratingSelect, { target: { value: "4" } });
    expect((ratingSelect as HTMLSelectElement).value).toBe("4");

    const sortSelect = screen.getByLabelText("Critério de ordenação");
    fireEvent.change(sortSelect, { target: { value: "rating_desc" } });
    expect((sortSelect as HTMLSelectElement).value).toBe("rating_desc");
  });

  it("resets page to 1 when a filter is applied while on a later page", async () => {
    mockBooksResponse = {
      data: mockBooksList,
      meta: {
        total: 30,
        page: 1,
        limit: 10,
        totalPages: 3,
      },
    };

    renderWithClient(<App />);

    // Navigate to page 3
    const page3Btn = await screen.findByRole("button", { name: "Ir para a página 3" });
    await act(async () => {
      fireEvent.click(page3Btn);
    });
    expect(page3Btn.getAttribute("aria-current")).toBe("page");

    // When selecting a genre, page is reset to 1
    const genreChip = screen.getByRole("button", { name: "Ficção Científica" });
    fireEvent.click(genreChip);

    const page1Btn = await screen.findByRole("button", { name: "Ir para a página 1" });
    expect(page1Btn.getAttribute("aria-current")).toBe("page");
  });

  it("clamps page when totalPages returned by server is less than current page", async () => {
    let currentTotalPages = 3;

    spyOn(api, "get").mockImplementation(((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url.includes("/genres")) {
        return Promise.resolve(createAxiosResponse({ data: mockGenresList }));
      }
      if (url.includes("/books")) {
        const requestedPage = (config?.params?.page as number) || 1;
        if (requestedPage === 3) {
          // Server indicates catalog shrunk to 2 pages
          currentTotalPages = 2;
        }
        return Promise.resolve(
          createAxiosResponse({
            data: mockBooksList,
            meta: {
              total: currentTotalPages * 10,
              page: requestedPage,
              limit: 10,
              totalPages: currentTotalPages,
            },
          }),
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    }) as unknown as typeof api.get);

    renderWithClient(<App />);

    // Navigate to page 3
    const page3Btn = await screen.findByRole("button", { name: "Ir para a página 3" });
    await act(async () => {
      fireEvent.click(page3Btn);
    });

    // Because page=3 returned totalPages=2, page should automatically adjust to 2
    await act(async () => {
      await waitFor(() => {
        const page2Btn = screen.getByRole("button", { name: "Ir para a página 2" });
        expect(page2Btn.getAttribute("aria-current")).toBe("page");
      });
    });
    expect(screen.queryByRole("button", { name: "Ir para a página 3" })).toBeNull();
  });
});
