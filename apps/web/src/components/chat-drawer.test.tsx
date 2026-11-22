import "../test-setup";
import { describe, expect, it, mock, spyOn } from "bun:test";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatDrawer } from "./chat-drawer";
import * as chatService from "@/services/chat";
import {
  CHAT_SESSION_EXPIRY_MS,
  CHAT_SESSION_STORAGE_KEY,
  saveSession,
} from "@/hooks/use-chat-session";

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
    const sendSpy = spyOn(chatService, "streamChatMessage").mockImplementation(
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

    const sendSpy = spyOn(chatService, "streamChatMessage").mockResolvedValueOnce({
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
    const sendSpy = spyOn(chatService, "streamChatMessage").mockResolvedValue({
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
    const sendSpy = spyOn(chatService, "streamChatMessage").mockImplementation(
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

  it("extracts Error message from streamChatMessage and falls back for non-Error rejections", async () => {
    const sendSpy = spyOn(chatService, "streamChatMessage")
      .mockRejectedValueOnce(new Error("Rate limit excedido. Aguarde 1 minuto."))
      .mockRejectedValueOnce("unexpected string rejection");

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Pergunta rápida" } });

    const sendBtn = screen.getByRole("button", { name: "Enviar mensagem" });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Rate limit excedido\. Aguarde 1 minuto\./i),
      ).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => {
      expect(
        screen.getByText("Ocorreu um erro ao comunicar com o assistente."),
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
    const sendSpy = spyOn(chatService, "streamChatMessage").mockImplementation(
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

  it("hides TypingIndicator on 1st delta, renders progressive tokens with smooth fade-in, scrolls smoothly, and renders AiCitationCards on done", async () => {
    const scrollIntoViewMock = mock();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    let emitDelta: ((delta: string) => void) | undefined;
    let finishStream!: (res: Awaited<ReturnType<typeof chatService.streamChatMessage>>) => void;

    const sendSpy = spyOn(chatService, "streamChatMessage").mockImplementation(
      (_params, options) => {
        emitDelta = options?.onDelta;
        return new Promise((resolve) => {
          finishStream = resolve;
        });
      },
    );

    try {
      const onSelectBook = mock();
      render(
        <ChatDrawer
          isOpen={true}
          onClose={() => {}}
          onSelectBook={onSelectBook}
        />,
      );

      const scrollContainer = screen.getByTestId("chat-scroll-container");
      let mockScrollHeight = 500;
      let mockScrollTop = 0;
      Object.defineProperty(scrollContainer, "clientHeight", {
        configurable: true,
        value: 300,
      });
      Object.defineProperty(scrollContainer, "scrollHeight", {
        configurable: true,
        get: () => mockScrollHeight,
      });
      Object.defineProperty(scrollContainer, "scrollTop", {
        configurable: true,
        get: () => mockScrollTop,
        set: (value: number) => {
          mockScrollTop = value;
        },
      });

      const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
      fireEvent.change(input, { target: { value: "Recomende Solaris" } });
      fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

      // Before 1st token: TypingIndicator visible, streaming bubble absent, smooth scroll ran
      expect(screen.getByRole("status")).toBeDefined();
      expect(document.querySelector("[aria-busy='true']")).toBeNull();
      expect(document.querySelectorAll(".animate-chat-token-fade").length).toBe(0);
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth" });
      const scrollCallsBeforeStream = scrollIntoViewMock.mock.calls.length;

      // 1st token arrives: syncs scrollTop via rAF without restarting smooth scroll
      await act(async () => {
        emitDelta?.("Recomendo ");
      });
      await waitFor(() => {
        expect(screen.queryByRole("status")).toBeNull();
        expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
        expect(scrollContainer.scrollTop).toBe(500);
      });
      expect(screen.queryByTestId("streaming-cursor")).toBeNull();
      expect(document.querySelectorAll(".animate-chat-token-fade").length).toBeGreaterThan(0);
      expect(screen.getByText("Recomendo")).toBeDefined();
      expect(scrollIntoViewMock.mock.calls.length).toBe(scrollCallsBeforeStream);

      // 2nd token arrives with taller content: updates scrollTop without scrollIntoView
      mockScrollHeight = 620;
      await act(async () => {
        emitDelta?.("**Solaris**.");
      });
      await waitFor(() => {
        expect(screen.getByText("Solaris")).toBeDefined();
        expect(scrollContainer.scrollTop).toBe(620);
      });
      expect(scrollIntoViewMock.mock.calls.length).toBe(scrollCallsBeforeStream);
      expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
      expect(document.querySelectorAll(".animate-chat-token-fade").length).toBeGreaterThan(1);
      expect(
        screen.queryByRole("button", { name: "Ver detalhes do livro Solaris" }),
      ).toBeNull();

      // Final done event triggers smooth scroll once cards arrive
      await act(async () => {
        finishStream({
          data: {
            userMessage: "Recomende Solaris",
            modelReply: "Recomendo **Solaris**.",
            books: [
              {
                id: "sol-1",
                title: "Solaris",
                author: "Stanislaw Lem",
                similarity: 92,
                genres: [{ slug: "sci-fi", name: "Ficção Científica" }],
              },
            ],
          },
          meta: {
            usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
          },
        });
      });

      await waitFor(() => {
        expect(document.querySelector("[aria-busy='true']")).toBeNull();
        expect(scrollIntoViewMock.mock.calls.length).toBeGreaterThan(
          scrollCallsBeforeStream,
        );
      });
      expect(document.querySelectorAll(".animate-chat-token-fade").length).toBe(0);

      const citationBtn = screen.getByRole("button", {
        name: "Ver detalhes do livro Solaris",
      });
      expect(citationBtn).toBeDefined();
      fireEvent.click(citationBtn);
      expect(onSelectBook).toHaveBeenCalledTimes(1);
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      sendSpy.mockRestore();
    }
  });

  it("does not force scroll to bottom while user has scrolled up during streaming", async () => {
    let emitDelta: ((delta: string) => void) | undefined;

    const sendSpy = spyOn(chatService, "streamChatMessage").mockImplementation(
      (_params, options) => {
        emitDelta = options?.onDelta;
        return new Promise(() => {});
      },
    );

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const scrollContainer = screen.getByTestId("chat-scroll-container");
    let mockScrollHeight = 600;
    let mockScrollTop = 0;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => mockScrollHeight,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => mockScrollTop,
      set: (value: number) => {
        mockScrollTop = value;
      },
    });

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Teste scroll manual" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    await act(async () => {
      emitDelta?.("Primeiro trecho ");
    });
    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(600);
    });

    // User scrolls up well above bottom threshold (600 - 100 - 200 = 300 > 80)
    scrollContainer.scrollTop = 100;
    fireEvent.scroll(scrollContainer);

    mockScrollHeight = 760;
    await act(async () => {
      emitDelta?.("segundo trecho chegando");
    });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(scrollContainer.scrollTop).toBe(100);

    sendSpy.mockRestore();
  });

  it("preserves partial text and clears streaming state without error banner when stopped mid-stream", async () => {
    let emitDelta: ((delta: string) => void) | undefined;

    const sendSpy = spyOn(chatService, "streamChatMessage").mockImplementation(
      (_params, options) => {
        emitDelta = options?.onDelta;
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    );

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Explique Duna" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    await act(async () => {
      emitDelta?.("Duna é um clássico ");
      emitDelta?.("sobre ecologia");
    });

    await waitFor(() => {
      const busyBubble = document.querySelector("[aria-busy='true']");
      expect(busyBubble).not.toBeNull();
      expect(busyBubble?.textContent).toMatch(/Duna é um clássico sobre ecologia/i);
    });
    expect(document.querySelectorAll(".animate-chat-token-fade").length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Interromper resposta" }),
      );
    });

    await waitFor(() => {
      expect(document.querySelector("[aria-busy='true']")).toBeNull();
    });
    expect(document.querySelectorAll(".animate-chat-token-fade").length).toBe(0);

    expect(screen.getByText(/Duna é um clássico sobre ecologia/i)).toBeDefined();
    expect(screen.queryByText("Solicitação encerrada.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    sendSpy.mockRestore();
  });

  it("handles mid-stream error by clearing streaming state, showing error banner, and retrying cleanly", async () => {
    let attempt = 0;
    let emitDelta: ((delta: string) => void) | undefined;
    let rejectFirstStream!: (err: Error) => void;

    const sendSpy = spyOn(chatService, "streamChatMessage").mockImplementation(
      (_params, options) => {
        attempt += 1;
        if (attempt === 1) {
          emitDelta = options?.onDelta;
          return new Promise((_resolve, reject) => {
            rejectFirstStream = reject;
          });
        }
        options?.onDelta?.("Resposta completa após retry.");
        return Promise.resolve({
          data: {
            userMessage: "Teste erro mid-stream",
            modelReply: "Resposta completa após retry.",
          },
          meta: {
            usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          },
        });
      },
    );

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Teste erro mid-stream" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    await act(async () => {
      emitDelta?.("Fragmento inicial antes da falha");
    });

    await waitFor(() => {
      expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
    });

    await act(async () => {
      rejectFirstStream(new Error("Erro durante transmissão SSE"));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText("Erro durante transmissão SSE")).toBeDefined();
    });
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
    expect(document.querySelectorAll(".animate-chat-token-fade").length).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => {
      expect(screen.getByText("Resposta completa após retry.")).toBeDefined();
    });
    expect(screen.queryByText("Fragmento inicial antes da falha")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    sendSpy.mockRestore();
  });

  it("aborts active stream when drawer closes mid-stream and clears streaming state", async () => {
    let capturedSignal: AbortSignal | undefined;
    let emitDelta: ((delta: string) => void) | undefined;

    const sendSpy = spyOn(chatService, "streamChatMessage").mockImplementation(
      (_params, options) => {
        capturedSignal = options?.signal;
        emitDelta = options?.onDelta;
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    );

    const { rerender } = render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Teste fechar" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    await act(async () => {
      emitDelta?.("Texto parcial antes de fechar");
    });
    await waitFor(() => {
      expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
    });

    await act(async () => {
      rerender(<ChatDrawer isOpen={false} onClose={() => {}} />);
    });
    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      rerender(<ChatDrawer isOpen={true} onClose={() => {}} />);
    });
    await waitFor(() => {
      expect(document.querySelector("[aria-busy='true']")).toBeNull();
    });
    expect(document.querySelectorAll(".animate-chat-token-fade").length).toBe(0);
    expect(screen.queryByRole("alert")).toBeNull();

    sendSpy.mockRestore();
  });

  it("clears fade-in state and aria-busy if signal aborts right as streamChatMessage resolves after deltas", async () => {
    let emitDelta: ((delta: string) => void) | undefined;
    let resolveStream!: (res: Awaited<ReturnType<typeof chatService.streamChatMessage>>) => void;

    const sendSpy = spyOn(chatService, "streamChatMessage").mockImplementation(
      (_params, options) => {
        emitDelta = options?.onDelta;
        return new Promise((resolve) => {
          resolveStream = resolve;
        });
      },
    );

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Race abort" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    await act(async () => {
      emitDelta?.("Texto antes da corrida");
    });

    await waitFor(() => {
      expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
      expect(document.querySelectorAll(".animate-chat-token-fade").length).toBeGreaterThan(0);
    });

    // Abort and resolve simultaneously (abort listener isn't used in mock, simulating resolution race)
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Interromper resposta" }),
      );
      resolveStream({
        data: {
          userMessage: "Race abort",
          modelReply: "Texto completo ignorado",
        },
        meta: {
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        },
      });
    });

    await waitFor(() => {
      expect(document.querySelector("[aria-busy='true']")).toBeNull();
    });
    expect(document.querySelectorAll(".animate-chat-token-fade").length).toBe(0);
    expect(screen.getByText("Texto antes da corrida")).toBeDefined();
    expect(screen.queryByText("Texto completo ignorado")).toBeNull();

    sendSpy.mockRestore();
  });

  it("keeps TypingIndicator visible and avoids creating blank bubble on whitespace-only first delta", async () => {
    let emitDelta: ((delta: string) => void) | undefined;
    let resolveStream!: (res: Awaited<ReturnType<typeof chatService.streamChatMessage>>) => void;

    const sendSpy = spyOn(chatService, "streamChatMessage").mockImplementation(
      (_params, options) => {
        emitDelta = options?.onDelta;
        return new Promise((resolve) => {
          resolveStream = resolve;
        });
      },
    );

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
    fireEvent.change(input, { target: { value: "Espaços iniciais" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    await act(async () => {
      emitDelta?.("   ");
    });

    expect(screen.getByRole("status")).toBeDefined();
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
    expect(document.querySelectorAll(".animate-chat-token-fade").length).toBe(0);

    await act(async () => {
      emitDelta?.("Olá leitor!");
    });

    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
      const busyBubble = document.querySelector("[aria-busy='true']");
      expect(busyBubble).not.toBeNull();
      expect(busyBubble?.textContent).toContain("Olá leitor!");
    });
    expect(document.querySelectorAll(".animate-chat-token-fade").length).toBe(2);

    await act(async () => {
      resolveStream({
        data: { userMessage: "Espaços iniciais", modelReply: "Olá leitor!" },
        meta: {
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        },
      });
    });

    await waitFor(() => {
      expect(document.querySelector("[aria-busy='true']")).toBeNull();
    });
    expect(document.querySelectorAll(".animate-chat-token-fade").length).toBe(0);
    expect(screen.getByText("Olá leitor!")).toBeDefined();

    sendSpy.mockRestore();
  });

  it("restores scroll position to the bottom immediately when closing and reopening the drawer", async () => {
    const scrollTopByEl = new WeakMap<HTMLElement, number>();
    const origScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    const origScrollTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollTop",
    );

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        if ((this as HTMLElement).dataset?.testid === "chat-scroll-container") {
          return 640;
        }
        return origScrollHeight?.get ? origScrollHeight.get.call(this) : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get() {
        if ((this as HTMLElement).dataset?.testid === "chat-scroll-container") {
          return scrollTopByEl.get(this as HTMLElement) ?? 0;
        }
        return origScrollTop?.get ? origScrollTop.get.call(this) : 0;
      },
      set(value: number) {
        if ((this as HTMLElement).dataset?.testid === "chat-scroll-container") {
          scrollTopByEl.set(this as HTMLElement, value);
          return;
        }
        origScrollTop?.set?.call(this, value);
      },
    });

    const sendSpy = spyOn(chatService, "streamChatMessage").mockResolvedValueOnce({
      data: {
        userMessage: "Pergunta longa",
        modelReply: "Resposta longa do assistente.",
      },
      meta: {
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      },
    });

    try {
      const { rerender } = render(
        <ChatDrawer isOpen={true} onClose={() => {}} />,
      );

      const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
      fireEvent.change(input, { target: { value: "Pergunta longa" } });
      fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

      await waitFor(() => {
        expect(screen.getByText("Resposta longa do assistente.")).toBeDefined();
      });

      await act(async () => {
        rerender(<ChatDrawer isOpen={false} onClose={() => {}} />);
      });
      expect(screen.queryByTestId("chat-scroll-container")).toBeNull();

      await act(async () => {
        rerender(<ChatDrawer isOpen={true} onClose={() => {}} />);
      });

      const reopenedContainer = screen.getByTestId("chat-scroll-container");
      expect(reopenedContainer.scrollTop).toBe(640);
    } finally {
      if (origScrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollHeight",
          origScrollHeight,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
      }
      if (origScrollTop) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollTop",
          origScrollTop,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollTop");
      }
      sendSpy.mockRestore();
    }
  });

  it("uses new sessionId synchronously and shows single expiration divider when session expires with visible messages", async () => {
    localStorage.clear();
    const expiredId = "expired-session-1111";
    saveSession({ sessionId: expiredId, lastActiveAt: Date.now() });

    const sendSpy = spyOn(chatService, "streamChatMessage").mockResolvedValue({
      data: {
        userMessage: "Segunda mensagem",
        modelReply: "Nova resposta no novo contexto.",
      },
      meta: {
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      },
    });

    try {
      const { rerender } = render(
        <ChatDrawer isOpen={true} onClose={() => {}} />,
      );

      // 1st message under active session
      const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");
      fireEvent.change(input, { target: { value: "Primeira mensagem" } });
      fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

      await waitFor(() => {
        expect(screen.getAllByText("Nova resposta no novo contexto.").length).toBe(1);
      });
      expect(sendSpy.mock.calls[0]?.[0].sessionId).toBe(expiredId);

      // Simulate >1h inactivity expiration in localStorage while drawer stays mounted
      saveSession({
        sessionId: expiredId,
        lastActiveAt: Date.now() - (CHAT_SESSION_EXPIRY_MS + 5000),
      });

      // Reopen drawer -> should show 1 divider
      await act(async () => {
        rerender(<ChatDrawer isOpen={false} onClose={() => {}} />);
      });
      await act(async () => {
        rerender(<ChatDrawer isOpen={true} onClose={() => {}} />);
      });

      const noticeText =
        "Sessão expirada após 1h de inatividade — iniciando novo contexto";
      expect(screen.getAllByText(noticeText).length).toBe(1);

      // Expire again & reopen again -> must NOT duplicate consecutive dividers
      const currentRaw = localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
      const currentSession = JSON.parse(currentRaw!) as { sessionId: string };
      saveSession({
        sessionId: currentSession.sessionId,
        lastActiveAt: Date.now() - (CHAT_SESSION_EXPIRY_MS + 5000),
      });

      await act(async () => {
        rerender(<ChatDrawer isOpen={false} onClose={() => {}} />);
      });
      await act(async () => {
        rerender(<ChatDrawer isOpen={true} onClose={() => {}} />);
      });

      expect(screen.getAllByText(noticeText).length).toBe(1);

      // Send message right after -> must send the renewed sessionId (not expiredId)
      const renewedRaw = localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
      const renewedSession = JSON.parse(renewedRaw!) as { sessionId: string };
      expect(renewedSession.sessionId).not.toBe(expiredId);

      fireEvent.change(
        screen.getByPlaceholderText("Pergunte sobre o acervo..."),
        { target: { value: "Segunda mensagem" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

      await waitFor(() => {
        expect(sendSpy).toHaveBeenCalledTimes(2);
      });
      expect(sendSpy.mock.calls[1]?.[0].sessionId).toBe(
        renewedSession.sessionId,
      );
    } finally {
      sendSpy.mockRestore();
    }
  });

  it("does not display expiration divider when drawer opens with no visible messages", () => {
    localStorage.clear();
    saveSession({
      sessionId: "expired-empty-session",
      lastActiveAt: Date.now() - (CHAT_SESSION_EXPIRY_MS + 5000),
    });

    render(<ChatDrawer isOpen={true} onClose={() => {}} />);

    expect(
      screen.queryByText(
        "Sessão expirada após 1h de inatividade — iniciando novo contexto",
      ),
    ).toBeNull();
  });

  it("renews sessionId and renders single expiration divider on send when session expires while drawer stays open", async () => {
    localStorage.clear();
    const initialId = "open-drawer-initial-session";
    saveSession({ sessionId: initialId, lastActiveAt: Date.now() });

    const sendSpy = spyOn(chatService, "streamChatMessage").mockResolvedValue({
      data: {
        userMessage: "Mensagem",
        modelReply: "Resposta",
      },
      meta: {
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      },
    });

    try {
      render(<ChatDrawer isOpen={true} onClose={() => {}} />);

      const input = screen.getByPlaceholderText(
        "Pergunte sobre o acervo...",
      ) as HTMLInputElement;
      expect(input.maxLength).toBe(2000);

      fireEvent.change(input, { target: { value: "Primeira" } });
      fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

      await waitFor(() => {
        expect(sendSpy).toHaveBeenCalledTimes(1);
      });
      expect(sendSpy.mock.calls[0]?.[0].sessionId).toBe(initialId);

      // Expire while drawer remains open (no close/reopen rerender)
      saveSession({
        sessionId: initialId,
        lastActiveAt: Date.now() - (CHAT_SESSION_EXPIRY_MS + 10000),
      });

      fireEvent.change(input, { target: { value: "Segunda após 1h" } });
      fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

      await waitFor(() => {
        expect(sendSpy).toHaveBeenCalledTimes(2);
      });

      const secondSessionId = sendSpy.mock.calls[1]?.[0].sessionId;
      expect(secondSessionId).toBeDefined();
      expect(secondSessionId).not.toBe(initialId);

      const noticeText =
        "Sessão expirada após 1h de inatividade — iniciando novo contexto";
      expect(screen.getAllByText(noticeText).length).toBe(1);
    } finally {
      sendSpy.mockRestore();
    }
  });

  it("blocks messages over 2000 characters and displays friendly message on 409 Conflict", async () => {
    localStorage.clear();
    const sendSpy = spyOn(chatService, "streamChatMessage").mockRejectedValue(
      new Error("A chat request is already in progress for this session."),
    );

    try {
      render(<ChatDrawer isOpen={true} onClose={() => {}} />);
      const input = screen.getByPlaceholderText("Pergunte sobre o acervo...");

      // Over 2000 characters blocked client-side before calling service
      fireEvent.change(input, { target: { value: "a".repeat(2001) } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(sendSpy).not.toHaveBeenCalled();
      expect(
        screen.getByText("A mensagem não pode ultrapassar 2000 caracteres."),
      ).toBeDefined();

      // Valid message receiving 409 shows friendly pt-BR conflict message
      fireEvent.change(input, { target: { value: "Pergunta válida" } });
      fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

      await waitFor(() => {
        expect(
          screen.getByText(
            "Já existe uma resposta em andamento nesta sessão. Aguarde a conclusão e tente novamente.",
          ),
        ).toBeDefined();
      });
    } finally {
      sendSpy.mockRestore();
    }
  });
});
