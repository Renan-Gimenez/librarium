import * as React from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Sparkles, Square, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui";
import { useChatSession } from "@/hooks/use-chat-session";
import { sendChatMessage } from "@/services/chat";
import { TypingIndicator } from "@/components/typing-indicator";
import { AiCitationCard } from "@/components/ai-citation-card";
import type { ApiErrorResponse, Book, ChatMessage } from "@/types/api";

function extractErrorMessage(err: unknown): string {
  if (
    axios.isAxiosError<ApiErrorResponse>(err) &&
    err.response?.data?.message
  ) {
    return err.response.data.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Ocorreu um erro ao comunicar com o assistente.";
}

const PROMPT_STARTERS = [
  "Me indique um livro de ficção científica com comédia",
  "Quais são os livros mais bem avaliados do acervo?",
  "Quero um livro sobre cosmologia e buracos negros",
] as const;

export interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBook?: (book: Book) => void;
  initialPrompt?: string;
}

export function ChatDrawer({
  isOpen,
  onClose,
  initialPrompt = "",
  onSelectBook,
}: ChatDrawerProps) {
  const { sessionId, touchSession } = useChatSession();
  const [inputValue, setInputValue] = React.useState(initialPrompt);
  const [prevPrompt, setPrevPrompt] = React.useState(initialPrompt);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const cancelledByUserRef = React.useRef(false);

  // Sync state with prop change without setState in useEffect
  if (initialPrompt !== prevPrompt) {
    setPrevPrompt(initialPrompt);
    setInputValue(initialPrompt);
  }

  const scrollToBottom = React.useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, error, scrollToBottom]);

  // Touch session and focus input when drawer opens
  React.useEffect(() => {
    if (isOpen) {
      touchSession();
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, touchSession]);

  // Abort pending request when drawer closes or unmounts
  React.useEffect(() => {
    if (!isOpen) {
      cancelledByUserRef.current = false;
      abortControllerRef.current?.abort();
    }
    return () => {
      cancelledByUserRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [isOpen]);

  const handleStopGeneration = () => {
    if (!isLoading) return;
    cancelledByUserRef.current = true;
    abortControllerRef.current?.abort();
  };

  const handleStarterClick = (starter: string) => {
    setInputValue(starter);
    inputRef.current?.focus();
  };

  const handleSendMessage = async (textToSend: string, isRetry = false) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    touchSession();
    if (!isRetry) {
      setInputValue("");
    }
    setError(null);

    if (!isRetry) {
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
    }

    setIsLoading(true);

    cancelledByUserRef.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const response = await sendChatMessage(
        {
          message: trimmed,
          sessionId,
        },
        { signal: abortControllerRef.current.signal }
      );

      const replyContent =
        response.data.modelReply?.trim() ||
        "Não consegui formular uma recomendação para este pedido. Poderia reformular a pergunta?";

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: replyContent,
        books: response.data.books,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      touchSession();
    } catch (err: unknown) {
      if (
        axios.isCancel(err) ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        if (cancelledByUserRef.current) {
          cancelledByUserRef.current = false;
          setMessages((prev) => [
            ...prev,
            {
              id: `cancelled-${Date.now()}`,
              role: "assistant",
              content: "Solicitação encerrada.",
              isCancelled: true,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        return;
      }
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  const handleRetry = () => {
    if (isLoading) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    handleSendMessage(lastUserMsg.content, true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    handleSendMessage(inputValue);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        hideCloseButton
        className="flex h-full w-[420px] max-w-[95vw] flex-col justify-between border-l border-[#272A34] bg-[#14161B] p-0 text-[#F4F4F6] shadow-2xl"
      >
        {/* Chat Header */}
        <SheetHeader className="flex shrink-0 flex-row items-center justify-between border-b border-[#272A34] p-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#241C3E] text-[#7C3AED]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="flex flex-col text-left">
              <SheetTitle className="font-serif text-[18px] font-semibold text-[#F4F4F6] leading-tight">
                Assistente Literário
              </SheetTitle>
              <SheetDescription className="text-[12px] text-[#A1A1AA]">
                Consultor do acervo · IA
              </SheetDescription>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar assistente"
            className="cursor-pointer rounded-full p-2 text-[#A1A1AA] transition-colors hover:bg-[#1C1F26] hover:text-[#F4F4F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </SheetHeader>

        {/* Chat Body (Scrollable) */}
        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
          {/* Welcome Message Bubble */}
          <div className="rounded-[4px_14px_14px_14px] border border-[#272A34] bg-[#1C1F26] p-4 shadow-sm">
            <p className="font-ui text-[13.5px] leading-[1.55] text-[#F4F4F6]">
              Olá! Sou o consultor literário do Librarium e conheço todo o
              acervo da livraria — títulos, sinopses, avaliações e temas. Me diga
              o que você está com vontade de ler e eu encontro a leitura certa
              para você.
            </p>
          </div>

          {/* Starters Section (when no messages yet) */}
          {messages.length === 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="font-ui text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                Sugestões para começar
              </span>
              <div className="flex flex-col gap-2">
                {PROMPT_STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => handleStarterClick(starter)}
                    className="w-full cursor-pointer rounded-[10px] border border-[#272A34] bg-[#14161B] p-3 text-left font-ui text-[12.5px] leading-snug text-[#F4F4F6] transition-colors hover:border-[#3A3E4A] hover:bg-[#1C1F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages List */}
          {messages.map((message) => {
            if (message.role === "user") {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-[14px_14px_4px_14px] bg-[#7C3AED] px-3.5 py-2.5 shadow-sm">
                    <p className="font-ui text-[13.5px] leading-[1.45] text-white whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {message.content}
                    </p>
                  </div>
                </div>
              );
            }

            if (message.isCancelled) {
              return (
                <div key={message.id} className="flex items-center gap-2.5">
                  <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] border border-[#272A34] bg-[#14161B] text-[#A1A1AA]">
                    <Square className="h-[10px] w-[10px]" aria-hidden="true" />
                  </div>
                  <p className="font-ui text-[12.5px] italic text-[#A1A1AA]">
                    {message.content}
                  </p>
                </div>
              );
            }

            return (
              <div key={message.id} className="flex items-start gap-2.5">
                <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#7C3AED] text-white mt-0.5">
                  <Sparkles className="h-[13px] w-[13px]" aria-hidden="true" />
                </div>
                <div className="flex flex-1 flex-col gap-2.5 rounded-[4px_14px_14px_14px] border border-[#272A34] bg-[#1C1F26] p-3.5 shadow-sm">
                  <div className="font-ui text-[13.5px] leading-[1.5] text-[#F4F4F6] break-words [overflow-wrap:anywhere]">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="mb-2.5 last:mb-0 leading-[1.5]">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-white">{children}</strong>
                        ),
                        em: ({ children }) => (
                          <em className="italic text-[#E4E4E7]">{children}</em>
                        ),
                        ul: ({ children }) => (
                          <ul className="my-2 list-disc pl-4 space-y-1">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="my-2 list-decimal pl-4 space-y-1">{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className="leading-relaxed pl-0.5">{children}</li>
                        ),
                        code: ({ children }) => (
                          <code className="rounded bg-[#272A34] px-1 py-0.5 font-mono text-[12px] text-[#E4E4E7]">
                            {children}
                          </code>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>

                  {/* Rich Cited Book Cards */}
                  {message.books && message.books.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2.5 border-t border-[#272A34]/60">
                      {message.books.map((citedBook) => (
                        <AiCitationCard
                          key={citedBook.id}
                          book={citedBook}
                          onSelect={onSelectBook}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator while waiting for response */}
          {isLoading && (
            <div className="flex items-start gap-2.5">
              <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#7C3AED] text-white mt-0.5">
                <Sparkles className="h-[13px] w-[13px]" aria-hidden="true" />
              </div>
              <TypingIndicator />
            </div>
          )}

          {/* Error Banner with Retry */}
          {error && (
            <div className="flex items-start gap-2.5">
              <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-red-500/20 text-red-400 mt-0.5">
                <X className="h-[13px] w-[13px]" aria-hidden="true" />
              </div>
              <div
                role="alert"
                className="flex flex-1 flex-col gap-2 rounded-[4px_14px_14px_14px] border border-red-500/30 bg-red-950/20 p-3.5 shadow-sm text-left"
              >
                <p className="font-ui text-[13px] text-red-200">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="self-start cursor-pointer rounded-[8px] border border-red-500/40 bg-red-900/40 px-3 py-1.5 font-ui text-[12px] font-medium text-red-100 transition-colors hover:bg-red-900/60"
                >
                  Tentar novamente
                </button>
              </div>
            </div>
          )}

          {/* Anchor to scroll */}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Footer */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-[#272A34] bg-[#14161B] p-4 sm:p-5">
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Mensagem para o assistente literário"
              placeholder="Pergunte sobre o acervo..."
              className="flex-1 rounded-[12px] border border-[#272A34] bg-[#0C0D10] px-3.5 py-2.5 text-[13.5px] text-[#F4F4F6] placeholder:text-[#71717A] dark:placeholder:text-[#A1A1AA] outline-none transition-colors focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]"
            />
            {isLoading ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                aria-label="Interromper resposta"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-[#272A34] text-[#F4F4F6] transition-colors hover:bg-[#3A3E4A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputValue.trim()}
                aria-label="Enviar mensagem"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-[#7C3AED] text-white transition-colors hover:bg-[#6D28D9] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
              >
                <ArrowUp className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
              </button>
            )}
          </form>

          <p className="text-center font-ui text-[10px] text-[#A1A1AA]">
            Recomendações baseadas no acervo real do Librarium.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
