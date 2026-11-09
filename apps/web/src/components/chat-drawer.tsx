import * as React from "react";
import { ArrowUp, Sparkles, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui";
import { useChatSession } from "@/hooks/use-chat-session";
import type { Book } from "@/types/api";

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
}: ChatDrawerProps) {
  const { touchSession } = useChatSession();
  const [inputValue, setInputValue] = React.useState(initialPrompt);
  const [prevPrompt, setPrevPrompt] = React.useState(initialPrompt);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync state with prop change without setState in useEffect
  if (initialPrompt !== prevPrompt) {
    setPrevPrompt(initialPrompt);
    setInputValue(initialPrompt);
  }

  // Touch session and focus input when drawer opens
  React.useEffect(() => {
    if (isOpen) {
      touchSession();
      // Small timeout to allow sheet animation and focus
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, touchSession]);

  const handleStarterClick = (starter: string) => {
    setInputValue(starter);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // Future Story 3.2: send message to API
      if (inputValue.trim()) {
        touchSession();
      }
    }
  };

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    if (inputValue.trim()) {
      touchSession();
    }
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
        <div className="flex flex-1 min-h-0 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
          {/* Welcome Message Bubble */}
          <div className="rounded-[4px_14px_14px_14px] border border-[#272A34] bg-[#1C1F26] p-4 shadow-sm">
            <p className="font-ui text-[13.5px] leading-[1.55] text-[#F4F4F6]">
              Olá! Sou o consultor literário do Librarium e conheço todo o
              acervo da livraria — títulos, sinopses, avaliações e temas. Me diga
              o que você está com vontade de ler e eu encontro a leitura certa
              para você.
            </p>
          </div>

          {/* Starters Section */}
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
            <button
              type="submit"
              disabled={!inputValue.trim()}
              aria-label="Enviar mensagem"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-[#7C3AED] text-white transition-colors hover:bg-[#6D28D9] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
            >
              <ArrowUp className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
            </button>
          </form>

          <p className="text-center font-ui text-[10px] text-[#A1A1AA]">
            Recomendações baseadas no acervo real do Librarium.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
