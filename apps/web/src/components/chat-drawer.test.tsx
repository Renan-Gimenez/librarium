import "../test-setup";
import { describe, expect, it, mock, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatDrawer } from "./chat-drawer";
import * as chatService from "@/services/chat";

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

  it("sends message to API, shows user bubble, typing indicator, and then assistant reply", async () => {
    const sendSpy = spyOn(chatService, "sendChatMessage").mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: {
                  userMessage: "Livros de fantasia",
                  modelReply: "Recomendo O Hobbit e O Senhor dos Anéis.",
                },
                meta: {
                  usage: {
                    promptTokens: 10,
                    completionTokens: 15,
                    totalTokens: 25,
                  },
                },
              }),
            50
          );
        })
    );

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Livros de fantasia" } });

    const sendBtn = screen.getByRole("button", { name: "Enviar mensagem" });
    fireEvent.click(sendBtn);

    // User message bubble appears immediately
    expect(screen.getByText("Livros de fantasia")).toBeDefined();

    // Typing indicator should appear
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText("gerando resposta...")).toBeDefined();

    // Assistant response arrives
    await waitFor(() => {
      expect(
        screen.getByText("Recomendo O Hobbit e O Senhor dos Anéis.")
      ).toBeDefined();
    });

    // Typing indicator is removed
    expect(screen.queryByRole("status")).toBeNull();

    sendSpy.mockRestore();
  });

  it("renders rich AiCitationCard within assistant message and triggers onSelectBook on click", async () => {
    const onSelectBook = mock();
    const mockBookData = {
      id: "cited-dune-1",
      title: "Duna",
      author: "Frank Herbert",
      description: "Clássico da ficção científica no planeta desértico.",
      coverUrl: "https://example.com/duna.jpg",
      rating: 4.8,
      similarity: 95,
      genres: [{ slug: "sci-fi", name: "Ficção Científica" }],
    };

    const sendSpy = spyOn(chatService, "sendChatMessage").mockResolvedValueOnce({
      data: {
        userMessage: "Recomende Duna",
        modelReply: "Duna é uma obra-prima de Frank Herbert.",
        books: [mockBookData],
      },
      meta: {
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      },
    });

    render(
      <ChatDrawer isOpen={true} onClose={() => {}} onSelectBook={onSelectBook} />
    );

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Recomende Duna" } });

    const sendBtn = screen.getByRole("button", { name: "Enviar mensagem" });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Duna é uma obra-prima de Frank Herbert.")
      ).toBeDefined();
    });

    // Rich card should be rendered
    const citationBtn = screen.getByRole("button", {
      name: "Ver detalhes do livro Duna",
    });
    expect(citationBtn).toBeDefined();
    expect(screen.getByText("95% match")).toBeDefined();

    // Clicking card invokes onSelectBook
    fireEvent.click(citationBtn);
    expect(onSelectBook).toHaveBeenCalledTimes(1);
    const selected = onSelectBook.mock.calls[0][0];
    expect(selected.id).toBe("cited-dune-1");
    expect(selected.title).toBe("Duna");

    sendSpy.mockRestore();
  });

  it("renders markdown formatting with strong tags and bullet points in assistant reply", async () => {
    const sendSpy = spyOn(chatService, "sendChatMessage").mockResolvedValue({
      data: {
        userMessage: "Indique",
        modelReply:
          "Recomendo **O Alquimista** por Paulo Coelho.\n\n- **Sinopse**: Uma jornada no deserto.",
      },
      meta: {
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      },
    });

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Indique" } });

    const sendBtn = screen.getByRole("button", { name: "Enviar mensagem" });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      const strongs = screen.getAllByText((content, element) => {
        return (
          element?.tagName.toLowerCase() === "strong" &&
          (content === "O Alquimista" || content === "Sinopse")
        );
      });
      expect(strongs.length).toBe(2);
    });

    sendSpy.mockRestore();
  });

  it("displays error banner with retry button when API fails and successfully retries", async () => {
    let callCount = 0;
    const sendSpy = spyOn(chatService, "sendChatMessage").mockImplementation(
      async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Falha na conexão com a API.");
        }
        return {
          data: {
            userMessage: "Teste falha",
            modelReply: "Recuperado após retry com sucesso!",
          },
          meta: {
            usage: {
              promptTokens: 5,
              completionTokens: 5,
              totalTokens: 10,
            },
          },
        };
      }
    );

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Teste falha" } });

    const sendBtn = screen.getByRole("button", { name: "Enviar mensagem" });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Falha na conexão com a API/i)).toBeDefined();
    });

    const retryBtn = screen.getByRole("button", { name: "Tentar novamente" });
    expect(retryBtn).toBeDefined();

    // Click retry
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Recuperado após retry com sucesso!")
      ).toBeDefined();
    });

    // Error is dismissed
    expect(screen.queryByText(/Falha na conexão com a API/i)).toBeNull();

    sendSpy.mockRestore();
  });

  it("extracts custom API error message from Axios response", async () => {
    const axiosError = {
      isAxiosError: true,
      response: {
        data: {
          message: "Rate limit excedido. Aguarde 1 minuto.",
        },
      },
    };

    const sendSpy = spyOn(chatService, "sendChatMessage").mockRejectedValueOnce(
      axiosError
    );

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Pergunta rápida" } });

    const sendBtn = screen.getByRole("button", { name: "Enviar mensagem" });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Rate limit excedido\. Aguarde 1 minuto\./i)
      ).toBeDefined();
    });

    sendSpy.mockRestore();
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
        initialPrompt="Conte mais sobre o livro Neuromancer"
      />
    );

    const input = screen.getByPlaceholderText(
      "Pergunte sobre o acervo..."
    ) as HTMLInputElement;
    expect(input.value).toBe("Conte mais sobre o livro Neuromancer");
  });

  it("keeps input enabled while loading, blocks Enter submit, and cancels request via stop button with feedback", async () => {
    const sendSpy = spyOn(chatService, "sendChatMessage").mockImplementation(
      (_params, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText(
      "Pergunte sobre o acervo..."
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Livros de terror" } });

    const sendBtn = screen.getByRole("button", { name: "Enviar mensagem" });
    fireEvent.click(sendBtn);

    // Input stays enabled so user can compose next message while waiting
    expect(input.disabled).toBe(false);
    expect(
      screen.getByPlaceholderText("Pergunte sobre o acervo...")
    ).toBeDefined();

    // Pressing Enter while loading should not dispatch a second request
    fireEvent.change(input, { target: { value: "Próxima pergunta" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(sendSpy).toHaveBeenCalledTimes(1);

    // Stop button replaces send button and aborts request with user feedback
    const stopBtn = screen.getByRole("button", {
      name: "Interromper resposta",
    });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(screen.getByText("Solicitação encerrada.")).toBeDefined();
    });

    // No error alert should be displayed and input preserves typed draft
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(input.value).toBe("Próxima pergunta");

    sendSpy.mockRestore();
  });
});
