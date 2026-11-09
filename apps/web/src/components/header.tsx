import * as React from "react";
import { BookOpen, Search, Sparkles, X } from "lucide-react";
import { Button, SearchBar } from "@repo/ui";

export interface HeaderProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  isAssistantOpen?: boolean;
  onOpenAssistant?: () => void;
  className?: string;
}

export const Header = React.forwardRef<HTMLElement, HeaderProps>(
  (
    {
      searchValue = "",
      onSearchChange,
      isAssistantOpen = false,
      onOpenAssistant,
      className = "",
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    const [isMac] = React.useState(() =>
      typeof navigator !== "undefined"
        ? /(Mac|iPhone|iPod|iPad)/i.test(
            navigator.userAgent || navigator.platform || "",
          )
        : true,
    );

    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented) return;

        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }

        if (
          event.key === "Escape" &&
          !event.isComposing &&
          document.activeElement === inputRef.current
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (searchValue) {
            onSearchChange?.("");
          } else {
            inputRef.current?.blur();
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, [searchValue, onSearchChange]);

    const handleClear = () => {
      onSearchChange?.("");
      inputRef.current?.focus();
    };

    return (
      <header
        ref={ref}
        className={`sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-[#272A34] bg-[#14161B] px-4 sm:px-6 lg:px-8 ${className}`}
      >
        {/* Logo Section */}
        <div className="flex shrink-0 items-center gap-2">
          <BookOpen className="h-5 w-5 text-[#4F46E5]" aria-hidden="true" />
          <span className="font-display text-[21px] font-bold tracking-tight text-[#F4F4F6]">
            Librarium
          </span>
        </div>

        {/* Global Search Bar */}
        <div className="mx-4 flex flex-1 max-w-[460px] items-center">
          <SearchBar className="w-full bg-[#1C1F26] border-[#272A34] focus-within:border-[#4F46E5] focus-within:ring-1 focus-within:ring-[#4F46E5]">
            <SearchBar.Icon>
              <Search className="h-4 w-4 text-[#A1A1AA]" aria-hidden="true" />
            </SearchBar.Icon>
            <SearchBar.Input
              ref={inputRef}
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Buscar por título, autor ou palavra-chave..."
              aria-label="Buscar livros no acervo"
            />
            {searchValue ? (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Limpar busca"
                className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#A1A1AA] transition-colors hover:bg-[#272A34] hover:text-[#F4F4F6]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <SearchBar.Shortcut
                title={
                  isMac
                    ? "Pressione ⌘K para buscar"
                    : "Pressione Ctrl+K para buscar"
                }
                className="bg-[#14161B] border-[#272A34] text-[#A1A1AA]"
              >
                {isMac ? "⌘K" : "Ctrl+K"}
              </SearchBar.Shortcut>
            )}
          </SearchBar>
        </div>

        {/* Actions / AI Assistant Button */}
        <div className="flex shrink-0 items-center gap-3">
          <Button
            type="button"
            variant="ai"
            size="sm"
            onClick={onOpenAssistant}
            aria-expanded={isAssistantOpen}
            aria-label="Abrir assistente literário com inteligência artificial"
            className="flex items-center gap-2 shadow-sm transition-all hover:shadow-[0_0_16px_rgba(124,58,237,0.35)]"
          >
            <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
            <span className="hidden font-medium text-[13px] sm:inline">
              Assistente IA
            </span>
          </Button>
        </div>
      </header>
    );
  },
);

Header.displayName = "Header";
