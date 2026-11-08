import "./test-setup";
import { describe, expect, it } from "bun:test";
import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app";
import { bookKeys } from "./hooks/use-books";
import type { Genre } from "./types/api";

const mockGenresList: Genre[] = [
  {
    slug: "sci-fi",
    name: "Ficção Científica",
    createdAt: "2026-08-23T03:00:00.000Z",
    updatedAt: "2026-08-23T03:00:00.000Z",
  },
];

function renderWithClient(
  ui: React.ReactElement,
  genres: Genre[] = mockGenresList,
) {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  if (genres.length > 0) {
    testQueryClient.setQueryData(bookKeys.genres(), { data: genres });
  }

  return render(
    <QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>,
  );
}

describe("App component integration", () => {
  it("renders header, filter bar and initial catalogue search instructions", () => {
    renderWithClient(<App />);

    expect(screen.getByText("Librarium")).toBeDefined();
    expect(screen.getByText("Assistente IA")).toBeDefined();
    expect(screen.getByRole("button", { name: "Todos" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Ficção Científica" }),
    ).toBeDefined();
    expect(
      screen.getByText(
        /ou clique na barra de busca para pesquisar livros no catálogo/i,
      ),
    ).toBeDefined();
  });

  it("propagates search input through useDebounce and renders debounced term after 300ms", async () => {
    renderWithClient(<App />);

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );

    // Type into input
    fireEvent.change(input, { target: { value: "Neuromancer" } });

    // Immediately, the debounced text should not have updated yet
    expect(screen.queryByText(/Termo pesquisado:/i)).toBeNull();

    // Advance timers past 300ms debounce delay
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(screen.getByText(/Termo pesquisado:/i)).toBeDefined();
    expect(screen.getByText(/"Neuromancer"/i)).toBeDefined();
  });

  it("toggles the assistant indicator when clicking the AI button", () => {
    renderWithClient(<App />);

    expect(screen.queryByText(/Assistente IA ativado/i)).toBeNull();

    const assistantBtn = screen.getByLabelText(
      "Abrir assistente literário com inteligência artificial",
    );
    fireEvent.click(assistantBtn);

    expect(screen.getByText(/Assistente IA ativado/i)).toBeDefined();

    fireEvent.click(assistantBtn);
    expect(screen.queryByText(/Assistente IA ativado/i)).toBeNull();
  });

  it("updates active filter indicator when a genre chip is selected and toggled off", () => {
    renderWithClient(<App />);

    const sciFiChip = screen.getByRole("button", { name: "Ficção Científica" });
    fireEvent.click(sciFiChip);

    expect(screen.getByText(/Gênero: sci-fi/i)).toBeDefined();

    // Toggle off by clicking again
    fireEvent.click(sciFiChip);
    expect(screen.queryByText(/Gênero: sci-fi/i)).toBeNull();
  });

  it("updates active filter indicator when rating filter is selected", () => {
    renderWithClient(<App />);

    const ratingSelect = screen.getByLabelText("Filtrar por avaliação mínima");
    fireEvent.change(ratingSelect, { target: { value: "4" } });

    expect(screen.getByText(/Nota mínima: ★ 4\+/i)).toBeDefined();
  });
});
