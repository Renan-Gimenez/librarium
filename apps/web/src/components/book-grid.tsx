import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@repo/ui";
import { BookCard, BookCardSkeleton } from "./book-card";
import { EmptyState } from "./empty-state";
import type { Book } from "@/types/api";

export interface BookGridProps {
  books?: Book[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onSelectBook?: (book: Book) => void;
  searchQuery?: string;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  onOpenAssistant?: () => void;
  skeletonCount?: number;
  className?: string;
}

export function BookGrid({
  books,
  isLoading = false,
  isError = false,
  onRetry,
  onSelectBook,
  searchQuery,
  hasFilters = false,
  onClearFilters,
  onOpenAssistant,
  skeletonCount = 10,
  className = "",
}: BookGridProps) {
  if (isError) {
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center rounded-[14px] border border-red-500/20 bg-[#14161B] p-12 text-center shadow-lg ${className}`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400 mb-3">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="font-serif text-lg font-semibold text-[#F4F4F6]">
          Erro ao carregar os livros
        </h3>
        <p className="mt-1 text-sm text-[#A1A1AA] max-w-sm">
          Não foi possível conectar ao catálogo. Verifique sua conexão e tente novamente.
        </p>
        {onRetry && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRetry}
            className="mt-5 flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tentar novamente</span>
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    const safeSkeletonCount = Math.max(
      0,
      Number.isFinite(skeletonCount) ? Math.floor(skeletonCount) : 10,
    );

    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Carregando catálogo de livros"
        className={`grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5 ${className}`}
      >
        <span className="sr-only">Carregando catálogo de livros...</span>
        {Array.from({ length: safeSkeletonCount }).map((_, index) => (
          <BookCardSkeleton key={`book-skeleton-${index}`} />
        ))}
      </div>
    );
  }

  if (!books || books.length === 0) {
    return (
      <EmptyState
        searchQuery={searchQuery}
        hasFilters={hasFilters}
        onClearFilters={onClearFilters}
        onOpenAssistant={onOpenAssistant}
        className={className}
      />
    );
  }

  return (
    <div
      role="region"
      aria-label="Catálogo de livros"
      className={`grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5 ${className}`}
    >
      {books.map((book, index) => (
        <BookCard
          key={book.id || `book-${index}`}
          book={book}
          onSelect={onSelectBook}
        />
      ))}
    </div>
  );
}

