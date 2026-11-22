import * as React from "react";
import { Sparkles, Star } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  StarRating,
} from "@repo/ui";
import { useSimilarBooks } from "@/hooks/use-books";
import type { Book, SimilarBook } from "@/types/api";

export interface BookDetailsModalProps {
  book: Book | null;
  isOpen: boolean;
  onClose: () => void;
  onAskAI?: (book: Book) => void;
  onSelectBook?: (book: Book) => void;
}

function toBookFromSimilar(similar: SimilarBook): Book {
  return {
    id: similar.id,
    title: similar.title,
    author: similar.author,
    description: similar.description,
    coverUrl: similar.coverUrl,
    genres: similar.genres.map((genre) => ({
      slug: genre.slug,
      name: genre.name,
      createdAt: "",
      updatedAt: "",
    })),
    rating: similar.rating,
    publishedAt: similar.publishedAt,
    createdAt: similar.createdAt,
    updatedAt: similar.createdAt,
  };
}

interface SimilarBookCardProps {
  book: SimilarBook;
  onSelect?: (book: Book) => void;
}

function SimilarBookCard({ book, onSelect }: SimilarBookCardProps) {
  const [imgError, setImgError] = React.useState(false);
  const [prevBookKey, setPrevBookKey] = React.useState(
    `${book.id}:${book.coverUrl ?? ""}`,
  );
  const currentBookKey = `${book.id}:${book.coverUrl ?? ""}`;

  if (currentBookKey !== prevBookKey) {
    setPrevBookKey(currentBookKey);
    setImgError(false);
  }

  const validCoverUrl = React.useMemo(() => {
    if (!book.coverUrl) return null;
    const trimmed = book.coverUrl.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  }, [book.coverUrl]);

  const hasImage = Boolean(validCoverUrl && !imgError);
  const displayTitle = book.title?.trim() || "Sem título";
  const displayAuthor = book.author?.trim() || "Autor desconhecido";

  const hasValidRating =
    typeof book.rating === "number" &&
    Number.isFinite(book.rating) &&
    book.rating >= 0 &&
    book.rating <= 5;

  const clampedSimilarity =
    typeof book.similarity === "number" && Number.isFinite(book.similarity)
      ? Math.max(1, Math.min(100, Math.round(book.similarity)))
      : null;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(toBookFromSimilar(book))}
      aria-label={`Ver detalhes do livro ${displayTitle}, por ${displayAuthor}`}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-[10px] border border-[#272A34] bg-[#0C0D10] p-2.5 text-left transition-colors hover:border-[#3A3E4A] hover:bg-[#1C1F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
    >
      <div className="relative h-[56px] w-[38px] shrink-0 overflow-hidden rounded-[4px] border border-[#272A34] bg-[#14161B]">
        {hasImage ? (
          <img
            src={validCoverUrl!}
            alt={`Capa do livro ${displayTitle}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div
            data-testid={`similar-book-fallback-${book.id}`}
            className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#1F2432] via-[#14161B] to-[#0D0E12] p-1 text-center"
          >
            <span className="font-serif text-[8px] font-semibold leading-tight text-[#F4F4F6] line-clamp-3 break-words">
              {displayTitle}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <span className="font-serif text-[13px] font-semibold leading-snug text-[#F4F4F6] line-clamp-1 break-words transition-colors group-hover:text-white">
          {displayTitle}
        </span>
        <span className="font-sans text-[11.5px] text-[#A1A1AA] line-clamp-1 break-words">
          {displayAuthor}
        </span>

        {(hasValidRating || clampedSimilarity !== null) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {hasValidRating && (
              <span className="inline-flex items-center gap-1 rounded-[5px] bg-[#14161B] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#F4F4F6]">
                <Star
                  className="h-2.5 w-2.5 fill-[#F59E0B] text-[#F59E0B]"
                  aria-hidden="true"
                />
                <span>{book.rating!.toFixed(1)}</span>
              </span>
            )}
            {clampedSimilarity !== null && (
              <span className="inline-flex items-center rounded-[5px] bg-[#7C3AED]/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#A78BFA]">
                {clampedSimilarity}% similar
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

export function BookDetailsModal({
  book,
  isOpen,
  onClose,
  onAskAI,
  onSelectBook,
}: BookDetailsModalProps) {
  const [imgError, setImgError] = React.useState(false);
  const [prevBookKey, setPrevBookKey] = React.useState(
    `${book?.id ?? ""}:${book?.coverUrl ?? ""}`,
  );
  const currentBookKey = `${book?.id ?? ""}:${book?.coverUrl ?? ""}`;

  const modalBodyRef = React.useRef<HTMLDivElement>(null);
  const detailsPanelRef = React.useRef<HTMLDivElement>(null);
  const synopsisRef = React.useRef<HTMLParagraphElement>(null);
  const similarHeadingId = React.useId();

  if (currentBookKey !== prevBookKey) {
    setPrevBookKey(currentBookKey);
    setImgError(false);
  }

  const {
    data: similarData,
    isLoading: isLoadingSimilar,
    isError: isSimilarError,
  } = useSimilarBooks(book?.id, 4, {
    enabled: isOpen && Boolean(book?.id),
  });

  React.useEffect(() => {
    if (!isOpen || !book?.id) {
      return;
    }

    const scrollContainerToTop = (element: HTMLElement | null) => {
      if (!element) return;
      if (typeof element.scrollTo === "function") {
        element.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        element.scrollTop = 0;
      }
    };

    scrollContainerToTop(modalBodyRef.current);
    scrollContainerToTop(detailsPanelRef.current);
    scrollContainerToTop(synopsisRef.current);
  }, [book?.id, isOpen]);

  const rawGenre = book?.genres?.[0]?.name;
  const primaryGenre =
    typeof rawGenre === "string" && rawGenre.trim().length > 0
      ? rawGenre.trim()
      : null;

  const publishedAt = book?.publishedAt;
  let formattedDate: string | null = null;
  let year: number | null = null;

  if (publishedAt) {
    const date = new Date(publishedAt);
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      if (Number.isFinite(y) && y > 0) {
        year = y;
      }
      try {
        formattedDate = new Intl.DateTimeFormat("pt-BR", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(date);
      } catch {
        formattedDate = year ? String(year) : null;
      }
    }
  }

  const hasValidRating =
    typeof book?.rating === "number" &&
    Number.isFinite(book.rating) &&
    book.rating >= 0 &&
    book.rating <= 5;

  if (!book) return null;

  const validCoverUrl = book.coverUrl?.trim() || null;
  const hasImage = Boolean(validCoverUrl && !imgError);

  const displayTitle = book.title?.trim() || "Sem título";
  const displayAuthor = book.author?.trim() || "Autor desconhecido";
  const displaySynopsis =
    book.description?.trim() || "Nenhuma sinopse disponível para esta obra.";

  const similarBooks = (similarData?.data ?? []).slice(0, 4);
  const showSimilarSkeletons = isLoadingSimilar;
  const showSimilarBooks =
    !isLoadingSimilar && !isSimilarError && similarBooks.length > 0;
  const shouldShowSimilarSection = showSimilarSkeletons || showSimilarBooks;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[880px] max-w-[95vw] overflow-hidden p-0 border border-[#272A34] bg-[#14161B] text-[#F4F4F6] shadow-[0_24px_64px_rgba(0,0,0,0.7)]"
      >
        <div
          ref={modalBodyRef}
          data-testid="book-details-scroll-container"
          className="flex flex-col md:flex-row max-h-[90vh] overflow-y-auto md:overflow-hidden"
        >
          {/* Cover Side (Left, 300px) */}
          <div className="relative w-full md:w-[300px] h-[320px] md:h-auto md:min-h-[520px] shrink-0 bg-[#14161B] border-b md:border-b-0 md:border-r border-[#272A34] overflow-hidden flex flex-col justify-between">
            {hasImage ? (
              <img
                src={validCoverUrl!}
                alt={`Capa do livro ${displayTitle}`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              /* Fallback Cover */
              <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-[#1F2432] via-[#14161B] to-[#0D0E12] p-6 text-center">
                <div />
                <div className="my-auto px-2">
                  <span className="font-serif text-xl md:text-2xl font-semibold leading-tight text-[#F4F4F6] line-clamp-4 break-words">
                    {displayTitle}
                  </span>
                  <span className="mt-2 block text-xs tracking-widest uppercase text-[#A1A1AA] line-clamp-1 break-words">
                    {displayAuthor}
                  </span>
                </div>
                <div />
              </div>
            )}

            {/* Top Badges Overlay on Cover */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-1 p-3 pr-12 md:pr-3">
              {primaryGenre ? (
                <span className="rounded-[6px] bg-white/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-900 shadow-sm backdrop-blur-xs">
                  {primaryGenre.toUpperCase()}
                </span>
              ) : (
                <span />
              )}

              {hasValidRating && (
                <span className="inline-flex items-center gap-1 rounded-[6px] bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm backdrop-blur-xs">
                  <Star
                    className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]"
                    aria-hidden="true"
                  />
                  <span>{book.rating!.toFixed(1)}</span>
                </span>
              )}
            </div>
          </div>

          {/* Info Side (Right) */}
          <div
            ref={detailsPanelRef}
            data-testid="book-details-panel"
            className="flex flex-1 flex-col justify-between p-6 sm:p-8 gap-5 overflow-y-visible md:overflow-y-auto"
          >
            <div className="flex flex-col gap-5">
              {/* Head */}
              <DialogHeader className="space-y-1.5 text-left pr-10 sm:pr-12">
                <DialogTitle className="font-serif text-2xl sm:text-3xl font-semibold text-[#F4F4F6] leading-tight break-words">
                  {displayTitle}
                </DialogTitle>
                <p className="text-sm sm:text-base text-[#A1A1AA] break-words">
                  {displayAuthor}
                </p>

                {/* Rating Block */}
                {hasValidRating && (
                  <div className="flex items-center gap-3 pt-1">
                    <StarRating
                      rating={book.rating!}
                      mode="stars"
                      size="sm"
                      aria-label={`Avaliação de ${book.rating!.toFixed(1)} de 5 estrelas`}
                    />
                    <span className="font-mono text-xs text-[#A1A1AA]">
                      {book.rating!.toFixed(1)} / 5.0
                    </span>
                  </div>
                )}
              </DialogHeader>

              {/* Meta Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="flex flex-col gap-0.5 rounded-[10px] border border-[#272A34] bg-[#0C0D10] p-3">
                  <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                    Publicação
                  </span>
                  <span className="font-mono text-xs text-[#F4F4F6]">
                    {formattedDate || (year ? String(year) : "Desconhecido")}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 rounded-[10px] border border-[#272A34] bg-[#0C0D10] p-3">
                  <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                    Gênero
                  </span>
                  <span className="truncate text-xs font-medium text-[#F4F4F6]">
                    {primaryGenre || "Geral"}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 rounded-[10px] border border-[#272A34] bg-[#0C0D10] p-3 col-span-2 sm:col-span-1">
                  <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                    Avaliação
                  </span>
                  <span className="font-mono text-xs text-[#F59E0B]">
                    {hasValidRating ? `★ ${book.rating!.toFixed(1)}` : "Sem nota"}
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px w-full bg-[#272A34]" aria-hidden="true" />

              {/* Synopsis */}
              <div className="flex flex-col gap-2">
                <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                  Sinopse
                </span>
                <DialogDescription
                  ref={synopsisRef}
                  className="text-sm text-[#F4F4F6]/90 leading-relaxed max-h-[180px] overflow-y-auto pr-1 break-words"
                >
                  {displaySynopsis}
                </DialogDescription>
              </div>

              {/* Similar Books */}
              {shouldShowSimilarSection && (
                <>
                  <div
                    className="h-px w-full bg-[#272A34]"
                    aria-hidden="true"
                  />
                  <section
                    aria-labelledby={similarHeadingId}
                    className="flex flex-col gap-2.5"
                  >
                    <h3
                      id={similarHeadingId}
                      className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]"
                    >
                      Livros parecidos
                    </h3>

                    {showSimilarSkeletons ? (
                      <div
                        data-testid="similar-books-skeleton"
                        aria-hidden="true"
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                      >
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 rounded-[10px] border border-[#272A34] bg-[#0C0D10] p-2.5"
                          >
                            <Skeleton className="h-[56px] w-[38px] shrink-0 rounded-[4px] bg-[#1C1F26]" />
                            <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                              <Skeleton className="h-3.5 w-4/5 rounded bg-[#1C1F26]" />
                              <Skeleton className="h-3 w-3/5 rounded bg-[#1C1F26]" />
                              <Skeleton className="h-3 w-2/5 rounded bg-[#1C1F26]" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {similarBooks.map((similarBook) => (
                          <SimilarBookCard
                            key={similarBook.id}
                            book={similarBook}
                            onSelect={onSelectBook}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>

            {/* Actions Footer */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-[#272A34]/50">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="border-[#272A34] bg-[#14161B] text-[#F4F4F6] hover:bg-[#1C1F26]"
              >
                Fechar
              </Button>

              {onAskAI && (
                <Button
                  variant="ai"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onAskAI(book);
                  }}
                  className="flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Perguntar à IA sobre este livro</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
