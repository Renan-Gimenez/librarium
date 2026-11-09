import * as React from "react";
import { Star } from "lucide-react";
import { Skeleton } from "@repo/ui";
import type { Book } from "@/types/api";

export interface BookCardProps {
  book: Book;
  onSelect?: (book: Book) => void;
  className?: string;
}

export function BookCard({ book, onSelect, className = "" }: BookCardProps) {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);

  const rawGenre = book.genres?.[0]?.name;
  const primaryGenre =
    typeof rawGenre === "string" && rawGenre.trim().length > 0
      ? rawGenre.trim()
      : null;

  const year = React.useMemo(() => {
    if (!book.publishedAt) return null;
    const date = new Date(book.publishedAt);
    const parsedYear = date.getFullYear();
    return Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : null;
  }, [book.publishedAt]);

  const hasValidRating =
    typeof book.rating === "number" &&
    Number.isFinite(book.rating) &&
    book.rating >= 0 &&
    book.rating <= 5;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && onSelect) {
      event.preventDefault();
      onSelect(book);
    }
  };

  const normalizedCoverUrl = React.useMemo(() => {
    if (!book.coverUrl) return null;
    const trimmed = book.coverUrl.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    return trimmed;
  }, [book.coverUrl]);

  const [prevCoverUrl, setPrevCoverUrl] = React.useState(normalizedCoverUrl);

  if (normalizedCoverUrl !== prevCoverUrl) {
    setPrevCoverUrl(normalizedCoverUrl);
    setFailedUrl(null);
  }

  const hasImage = Boolean(
    normalizedCoverUrl && failedUrl !== normalizedCoverUrl,
  );

  const displayTitle = book.title?.trim() || "Sem título";
  const displayAuthor = book.author?.trim() || "Autor desconhecido";

  return (
    <div
      role={onSelect ? "button" : "article"}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(book)}
      onKeyDown={handleKeyDown}
      aria-label={`Livro: ${displayTitle}, por ${displayAuthor}`}
      className={`group flex ${
        onSelect ? "cursor-pointer" : "cursor-default"
      } flex-col gap-2.5 text-left transition-all duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0C0D10] ${className}`}
    >
      {/* Cover Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[8px] border border-[#272A34] bg-[#14161B] transition-all duration-200 group-hover:border-[#3A3E4A] group-hover:shadow-[0_12px_28px_rgba(0,0,0,0.5)]">
        {hasImage ? (
          <img
            src={normalizedCoverUrl!}
            alt={`Capa do livro ${displayTitle}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              console.warn(
                `[Librarium] Falha ao carregar imagem de capa de "${displayTitle}": ${normalizedCoverUrl}`,
              );
              if (normalizedCoverUrl) {
                setFailedUrl(normalizedCoverUrl);
              }
            }}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          /* Fallback Cover */
          <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-[#1F2432] via-[#14161B] to-[#0D0E12] p-4 text-center">
            <div className="flex items-center justify-between" />
            <div className="my-auto px-2">
              <span className="font-serif text-sm font-semibold leading-snug text-[#F4F4F6] line-clamp-4 break-words">
                {displayTitle}
              </span>
              <span className="mt-1 block text-[11px] text-[#A1A1AA] line-clamp-1 break-words">
                {displayAuthor}
              </span>
            </div>
            <div />
          </div>
        )}

        {/* Top Badges Overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-1 p-2.5">
          {primaryGenre ? (
            <span
              title={primaryGenre}
              className="max-w-[110px] truncate rounded-[6px] bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-900 shadow-sm backdrop-blur-xs"
            >
              {primaryGenre.toUpperCase()}
            </span>
          ) : (
            <span />
          )}

          {hasValidRating && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm backdrop-blur-xs">
              <Star
                className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]"
                aria-hidden="true"
              />
              <span>{book.rating!.toFixed(1)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Info Container */}
      <div className="flex flex-col gap-1 min-w-0">
        <h3
          title={displayTitle}
          className="font-serif text-[15px] font-semibold leading-snug text-[#F4F4F6] line-clamp-2 h-[40px] break-words transition-colors group-hover:text-white"
        >
          {displayTitle}
        </h3>
        <div className="flex items-center justify-between text-xs text-[#A1A1AA] pt-0.5 min-w-0">
          <span title={displayAuthor} className="truncate pr-2 min-w-0">
            {displayAuthor}
          </span>
          {year != null && (
            <span className="font-mono text-[11px] shrink-0 text-[#A1A1AA]">
              {year}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function BookCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex flex-col gap-2.5 ${className}`}
    >
      <Skeleton className="aspect-[2/3] w-full rounded-[8px] bg-[#1C1F26]" />
      <div className="flex flex-col gap-1.5 pt-1">
        <Skeleton className="h-[18px] w-4/5 rounded-[6px] bg-[#1C1F26]" />
        <Skeleton className="h-[14px] w-3/5 rounded-[6px] bg-[#1C1F26]" />
      </div>
      <div className="flex items-center justify-between pt-0.5">
        <Skeleton className="h-[12px] w-1/2 rounded-[6px] bg-[#1C1F26]" />
        <Skeleton className="h-[12px] w-1/5 rounded-[6px] bg-[#1C1F26]" />
      </div>
    </div>
  );
}
