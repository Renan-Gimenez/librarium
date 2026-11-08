import "./test-setup";
import { describe, expect, it } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./app";

describe("App component integration", () => {
  it("renders header and initial catalogue search instructions", () => {
    render(<App />);

    expect(screen.getByText("Librarium")).toBeDefined();
    expect(screen.getByText("Assistente IA")).toBeDefined();
    expect(
      screen.getByText(/ou clique na barra de busca para pesquisar livros no catálogo/i),
    ).toBeDefined();
  });

  it("propagates search input through useDebounce and renders debounced term after 300ms", async () => {
    render(<App />);

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );

    // Type into input
    fireEvent.change(input, { target: { value: "Neuromancer" } });

    // Immediately, the debounced text should not have updated yet
    expect(
      screen.queryByText(/Termo pesquisado:/i),
    ).toBeNull();

    // Advance timers past 300ms debounce delay
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(
      screen.getByText(/Termo pesquisado:/i),
    ).toBeDefined();
    expect(screen.getByText(/"Neuromancer"/i)).toBeDefined();
  });

  it("toggles the assistant indicator when clicking the AI button", () => {
    render(<App />);

    expect(
      screen.queryByText(/Assistente IA ativado/i),
    ).toBeNull();

    const assistantBtn = screen.getByLabelText(
      "Abrir assistente literário com inteligência artificial",
    );
    fireEvent.click(assistantBtn);

    expect(
      screen.getByText(/Assistente IA ativado/i),
    ).toBeDefined();

    fireEvent.click(assistantBtn);
    expect(
      screen.queryByText(/Assistente IA ativado/i),
    ).toBeNull();
  });
});

