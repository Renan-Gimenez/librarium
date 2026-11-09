import * as React from "react";
import { Sparkles, Star } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  StarRating,
} from "@repo/ui";
import type { Book } from "@/types/api";

export interface BookDetailsModalProps {
  book: Book | null;
  isOpen: boolean;
  onClose: () => void;
  onAskAI?: (book: Book) => void;
}

export function BookDetailsModal({
  book,
  isOpen,
  onClose,
  onAskAI,
}: BookDetailsModalProps) {
  const [imgError, setImgError] = React.useState(false);
  const [prevUrl, setPrevUrl] = React.useState(book?.coverUrl);

  if (book?.coverUrl !== prevUrl) {
    setPrevUrl(book?.coverUrl);
    setImgError(false);
  }

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[880px] max-w-[95vw] overflow-hidden p-0 border border-[#272A34] bg-[#14161B] text-[#F4F4F6] shadow-[0_24px_64px_rgba(0,0,0,0.7)]"
      >
        <div className="flex flex-col md:flex-row max-h-[90vh] overflow-y-auto md:overflow-hidden">
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
          <div className="flex flex-1 flex-col justify-between p-6 sm:p-8 gap-5 overflow-y-visible md:overflow-y-auto">
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
                <DialogDescription className="text-sm text-[#F4F4F6]/90 leading-relaxed max-h-[180px] overflow-y-auto pr-1 break-words">
                  {displaySynopsis}
                </DialogDescription>
              </div>
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
