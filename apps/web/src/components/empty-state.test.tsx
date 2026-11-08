import { describe, expect, it, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState Component", () => {
  it("renders default empty state message", () => {
    render(<EmptyState />);

    expect(screen.getByText("Nenhum livro encontrado")).toBeDefined();
    expect(
      screen.getByText("Não encontramos livros disponíveis no momento."),
    ).toBeDefined();
  });

  it("renders message with search query and filters", () => {
    render(<EmptyState searchQuery="cyberpunk" hasFilters />);

    expect(
      screen.getByText(
        'Não encontramos resultados para a busca "cyberpunk" com os filtros aplicados.',
      ),
    ).toBeDefined();
  });

  it("renders message when only search query is provided", () => {
    render(<EmptyState searchQuery="cyberpunk" />);

    expect(
      screen.getByText('Não encontramos resultados para a busca "cyberpunk".'),
    ).toBeDefined();
  });

  it("renders message when only filters are applied", () => {
    render(<EmptyState hasFilters />);

    expect(
      screen.getByText("Não encontramos nenhum livro com os filtros selecionados."),
    ).toBeDefined();
  });

  it("does not render clear filters button when neither search nor filters are present", () => {
    render(<EmptyState onClearFilters={mock()} />);

    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
  });

  it("has region role and accessible name", () => {
    render(<EmptyState />);

    const region = screen.getByRole("region", { name: "Nenhum livro encontrado" });
    expect(region).toBeDefined();
  });

  it("calls onClearFilters when clear button is clicked", () => {
    const onClear = mock();
    render(<EmptyState searchQuery="test" onClearFilters={onClear} />);

    const button = screen.getByRole("button", { name: "Limpar filtros" });
    fireEvent.click(button);

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenAssistant when ask AI button is clicked", () => {
    const onOpen = mock();
    render(<EmptyState onOpenAssistant={onOpen} />);

    const button = screen.getByRole("button", {
      name: "Pedir recomendação para a IA",
    });
    fireEvent.click(button);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

