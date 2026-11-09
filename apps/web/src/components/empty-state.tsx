import { SearchX, Sparkles } from "lucide-react";
import { Button } from "@repo/ui";

export interface EmptyStateProps {
  searchQuery?: string;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  onOpenAssistant?: () => void;
  className?: string;
}

export function EmptyState({
  searchQuery,
  hasFilters,
  onClearFilters,
  onOpenAssistant,
  className = "",
}: EmptyStateProps) {
  const trimmedSearch = searchQuery?.trim();

  let message = "Não encontramos livros disponíveis no momento.";
  if (trimmedSearch && hasFilters) {
    message = `Não encontramos resultados para a busca "${trimmedSearch}" com os filtros aplicados.`;
  } else if (trimmedSearch) {
    message = `Não encontramos resultados para a busca "${trimmedSearch}".`;
  } else if (hasFilters) {
    message = "Não encontramos nenhum livro com os filtros selecionados.";
  }

  return (
    <div
      role="region"
      aria-label="Nenhum livro encontrado"
      className={`flex flex-col items-center justify-center rounded-[14px] border border-[#272A34] bg-[#14161B] px-6 py-16 text-center shadow-lg ${className}`}
    >
      <div
        className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-[#272A34] bg-[#1C1F26] text-[#A1A1AA]"
        aria-hidden="true"
      >
        <SearchX className="h-8 w-8 text-[#A1A1AA]" />
      </div>

      <h3 className="mt-5 font-serif text-2xl font-semibold text-[#F4F4F6]">
        Nenhum livro encontrado
      </h3>

      <p className="mt-2 max-w-md text-sm text-[#A1A1AA] leading-relaxed break-words">
        {message}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {(hasFilters || Boolean(trimmedSearch)) && onClearFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearFilters}
            className="border-[#272A34] bg-[#1C1F26] text-[#F4F4F6] hover:border-[#3A3E4A] hover:bg-[#252933]"
          >
            Limpar filtros
          </Button>
        )}

        {onOpenAssistant && (
          <Button
            variant="ai"
            size="sm"
            onClick={onOpenAssistant}
            className="flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Pedir recomendação para a IA</span>
          </Button>
        )}
      </div>
    </div>
  );
}

