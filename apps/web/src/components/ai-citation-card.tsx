import * as React from "react";
import { ArrowRight, Star } from "lucide-react";
import type { Book, CitedBook } from "@/types/api";
import { toFullBook } from "@/lib/book-utils";

export interface AiCitationCardProps {
  book: CitedBook;
  onSelect?: (book: Book) => void;
  className?: string;
}

export function AiCitationCard({
  book,
  onSelect,
  className = "",
}: AiCitationCardProps) {
  const [imgError, setImgError] = React.useState(false);
  const [prevCoverUrl, setPrevCoverUrl] = React.useState(book.coverUrl);

  if (book.coverUrl !== prevCoverUrl) {
    setPrevCoverUrl(book.coverUrl);
    setImgError(false);
  }

  const handleClick = () => {
    onSelect?.(toFullBook(book));
  };

  const safeTitle = book.title || "Livro";
  const numRating =
    book.rating !== null && book.rating !== undefined
      ? Number(book.rating)
      : null;
  const isValidRating = numRating !== null && !Number.isNaN(numRating);
  const clampedSimilarity =
    book.similarity !== undefined && book.similarity !== null
      ? Math.max(1, Math.min(100, Math.round(book.similarity)))
      : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Ver detalhes do livro ${safeTitle}`}
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-[12px] border border-[#272A34] bg-[#14161B] p-2.5 text-left transition-colors hover:border-[#3A3E4A] hover:bg-[#1C1F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] ${className}`}
    >
      {/* Thumbnail */}
      <div className="relative h-[60px] w-[40px] shrink-0 overflow-hidden rounded-[4px] bg-[#1C1F26]">
        {book.coverUrl && !imgError ? (
          <img
            src={book.coverUrl}
            alt={safeTitle}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col justify-end bg-gradient-to-br from-[#2B3A67] to-[#14161B] p-1 text-center">
            <span className="font-serif text-[8px] font-semibold leading-tight text-white line-clamp-2">
              {safeTitle.slice(0, 10)}
            </span>
          </div>
        )}
      </div>

      {/* Mid: Info */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <span className="font-ui text-[13px] font-semibold leading-[1.25] text-[#F4F4F6] line-clamp-1">
          {safeTitle}
        </span>
        <span className="font-ui text-[12px] text-[#A1A1AA] line-clamp-1">
          {book.author || "Autor desconhecido"}
        </span>

        {/* Tags Row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          {isValidRating && (
            <div className="inline-flex items-center gap-1 rounded-[5px] bg-[#1C1F26] px-1.5 py-0.5">
              <Star
                className="h-2.5 w-2.5 fill-[#F59E0B] text-[#F59E0B]"
                aria-hidden="true"
              />
              <span className="font-ui text-[11px] font-semibold text-[#F4F4F6]">
                {numRating.toFixed(1)}
              </span>
            </div>
          )}

          {clampedSimilarity !== null && (
            <div className="inline-flex items-center rounded-[5px] bg-[#7C3AED]/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#7C3AED]">
              {clampedSimilarity}% match
            </div>
          )}
        </div>
      </div>

      {/* Action Chevron */}
      <div className="flex h-6 w-6 shrink-0 items-center justify-center text-[#7C3AED] transition-transform group-hover:translate-x-0.5">
        <ArrowRight className="h-3.5 w-3.5 stroke-[2.2]" aria-hidden="true" />
      </div>
    </button>
  );
}
