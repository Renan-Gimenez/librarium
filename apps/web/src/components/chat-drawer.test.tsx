import "../test-setup";
import { describe, expect, it, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatDrawer } from "./chat-drawer";

const EXPECTED_STARTERS = [
  "Me indique um livro de ficção científica com comédia",
  "Quais são os livros mais bem avaliados do acervo?",
  "Quero um livro sobre cosmologia e buracos negros",
];

describe("ChatDrawer Component", () => {
  it("renders drawer with header, welcome bubble, prompt starters, and input when open", () => {
    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    expect(screen.getByText("Assistente Literário")).toBeDefined();
    expect(screen.getByText("Consultor do acervo · IA")).toBeDefined();
    expect(screen.getByText(/Sou o consultor literário do Librarium/i)).toBeDefined();
    expect(screen.getByText("Sugestões para começar")).toBeDefined();

    // All 3 starters must be present
    for (const starter of EXPECTED_STARTERS) {
      expect(screen.getByRole("button", { name: starter })).toBeDefined();
    }

    expect(
      screen.getByPlaceholderText("Pergunte sobre o acervo...")
    ).toBeDefined();
    expect(
      screen.getByText("Recomendações baseadas no acervo real do Librarium.")
    ).toBeDefined();
  });

  it("does not render content when isOpen is false", () => {
    render(<ChatDrawer isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText("Assistente Literário")).toBeNull();
  });

  it("populates input when a prompt starter is clicked", () => {
    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const starterBtn = screen.getByRole("button", {
      name: EXPECTED_STARTERS[0],
    });
    fireEvent.click(starterBtn);

    const input = screen.getByPlaceholderText(
      "Pergunte sobre o acervo..."
    ) as HTMLInputElement;
    expect(input.value).toBe(EXPECTED_STARTERS[0]);
  });

  it("enables send button only when input has non-whitespace text", () => {
    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const sendBtn = screen.getByRole("button", {
      name: "Enviar mensagem",
    }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "   " } });
    expect(sendBtn.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "Quais livros você tem?" } });
    expect(sendBtn.disabled).toBe(false);
  });

  it("invokes onClose when clicking the close button", () => {
    const onClose = mock();
    render(<ChatDrawer isOpen={true} onClose={onClose} />);

    const closeBtn = screen.getByRole("button", {
      name: "Fechar assistente",
    });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onClose when clicking the backdrop overlay", () => {
    const onClose = mock();
    render(<ChatDrawer isOpen={true} onClose={onClose} />);

    const overlay = screen.getByTestId("sheet-overlay");
    expect(overlay).toBeDefined();
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes drawer on Escape key press", () => {
    const onClose = mock();
    render(<ChatDrawer isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("pre-populates input when initialPrompt is provided", () => {
    render(
      <ChatDrawer
        isOpen={true}
        onClose={() => {}}
        initialPrompt="Me fale sobre Duna"
      />
    );

    const input = screen.getByPlaceholderText(
      "Pergunte sobre o acervo..."
    ) as HTMLInputElement;
    expect(input.value).toBe("Me fale sobre Duna");
  });
});
