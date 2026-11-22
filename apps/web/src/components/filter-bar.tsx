import * as React from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { GenreChip, Skeleton } from "@repo/ui";
import type { BookSortBy, Genre, SortOrder } from "@/types/api";

export interface FilterBarProps {
  genres?: Genre[];
  isLoadingGenres?: boolean;
  selectedGenre?: string;
  onSelectGenre?: (genreSlug: string | undefined) => void;
  sortBy?: BookSortBy;
  sortOrder?: SortOrder;
  onSortChange?: (sortBy: BookSortBy, sortOrder: SortOrder) => void;
  minRating?: number;
  onMinRatingChange?: (minRating: number | undefined) => void;
  totalBooks?: number;
  className?: string;
}

const VALID_SORT_KEYS = [
  "createdAt_desc",
  "rating_desc",
  "publishedAt_desc",
  "title_asc",
  "title_desc",
];

const VALID_RATINGS = ["4.5", "4", "3.5", "3"];

export function FilterBar({
  genres = [],
  isLoadingGenres = false,
  selectedGenre,
  onSelectGenre,
  sortBy = "createdAt",
  sortOrder = "desc",
  onSortChange,
  minRating,
  onMinRatingChange,
  totalBooks,
  className = "",
}: FilterBarProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  React.useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [genres, checkScroll]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (e.deltaY !== 0) {
      el.scrollLeft += e.deltaY;
    }
  };

  const scrollByAmount = (offset: number) => {
    scrollContainerRef.current?.scrollBy({ left: offset, behavior: "smooth" });
  };

  const currentKey = `${sortBy}_${sortOrder}`;
  const currentSortKey = VALID_SORT_KEYS.includes(currentKey)
    ? currentKey
    : "createdAt_desc";

  const ratingValue =
    minRating !== undefined && VALID_RATINGS.includes(String(minRating))
      ? String(minRating)
      : "";

  const handleSortSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const [newSortBy, newOrder] = value.split("_") as [BookSortBy, SortOrder];
    onSortChange?.(newSortBy, newOrder);
  };

  const handleRatingSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onMinRatingChange?.(value ? Number(value) : undefined);
  };

  return (
    <div className={`flex w-full flex-col gap-3 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {/* Horizontal Chips Carousel with Scroll Controls */}
        <div className="relative flex flex-1 min-w-0 items-center">
          {/* Scroll Left Button */}
          {canScrollLeft && (
            <div className="absolute left-0 z-10 flex h-full items-center bg-gradient-to-r from-[#0C0D10] via-[#0C0D10]/90 to-transparent pr-3">
              <button
                type="button"
                onClick={() => scrollByAmount(-220)}
                aria-label="Rolar gêneros para esquerda"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[#272A34] bg-[#14161B] text-[#A1A1AA] shadow-md transition-all hover:bg-[#1C1F26] hover:text-[#F4F4F6]"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Chips Scroll Area */}
          <div
            ref={scrollContainerRef}
            role="group"
            aria-label="Filtros de gênero"
            aria-busy={isLoadingGenres}
            onWheel={handleWheel}
            className="flex flex-1 items-center gap-2 overflow-x-auto scroll-smooth pb-1 pt-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <GenreChip
              active={!selectedGenre}
              onClick={() => onSelectGenre?.(undefined)}
              aria-pressed={!selectedGenre}
            >
              Todos
            </GenreChip>

            {isLoadingGenres ? (
              <>
                <span className="sr-only">Carregando gêneros literários...</span>
                <Skeleton className="h-[35px] w-20 shrink-0 rounded-full" />
                <Skeleton className="h-[35px] w-24 shrink-0 rounded-full" />
                <Skeleton className="h-[35px] w-20 shrink-0 rounded-full" />
                <Skeleton className="h-[35px] w-28 shrink-0 rounded-full" />
                <Skeleton className="h-[35px] w-22 shrink-0 rounded-full" />
              </>
            ) : (
              genres.map((genre) => (
                <GenreChip
                  key={genre.slug}
                  active={selectedGenre === genre.slug}
                  onClick={() =>
                    onSelectGenre?.(
                      selectedGenre === genre.slug ? undefined : genre.slug,
                    )
                  }
                  aria-pressed={selectedGenre === genre.slug}
                  className="shrink-0"
                >
                  {genre.name}
                </GenreChip>
              ))
            )}
          </div>

          {/* Scroll Right Button */}
          {canScrollRight && (
            <div className="absolute right-0 z-10 flex h-full items-center bg-gradient-to-l from-[#0C0D10] via-[#0C0D10]/90 to-transparent pl-3">
              <button
                type="button"
                onClick={() => scrollByAmount(220)}
                aria-label="Rolar gêneros para direita"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[#272A34] bg-[#14161B] text-[#A1A1AA] shadow-md transition-all hover:bg-[#1C1F26] hover:text-[#F4F4F6]"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* Vertical Divider */}
        <div
          className="hidden sm:block h-6 w-px bg-[#272A34] mx-1 shrink-0"
          aria-hidden="true"
        />

        {/* Filters and Controls */}
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          {/* Min Rating Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              value={ratingValue}
              onChange={handleRatingSelect}
              aria-label="Filtrar por avaliação mínima"
              className="h-9 cursor-pointer appearance-none rounded-[8px] border border-[#272A34] bg-[#14161B] pl-3 pr-8 text-[12px] font-medium text-[#F4F4F6] transition-colors hover:border-[#3A3E4A] focus-visible:border-[#4F46E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
            >
              <option value="" className="bg-[#14161B] text-[#F4F4F6]">
                Todas as notas
              </option>
              <option value="4.5" className="bg-[#14161B] text-[#F4F4F6]">
                ★ 4.5+
              </option>
              <option value="4" className="bg-[#14161B] text-[#F4F4F6]">
                ★ 4.0+
              </option>
              <option value="3.5" className="bg-[#14161B] text-[#F4F4F6]">
                ★ 3.5+
              </option>
              <option value="3" className="bg-[#14161B] text-[#F4F4F6]">
                ★ 3.0+
              </option>
            </select>
            <Star
              className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#A1A1AA]"
              aria-hidden="true"
            />
          </div>

          {/* Sort By Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              value={currentSortKey}
              onChange={handleSortSelect}
              aria-label="Critério de ordenação"
              className="h-9 cursor-pointer appearance-none rounded-[8px] border border-[#272A34] bg-[#14161B] pl-3 pr-8 text-[12px] font-medium text-[#F4F4F6] transition-colors hover:border-[#3A3E4A] focus-visible:border-[#4F46E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
            >
              <option
                value="createdAt_desc"
                className="bg-[#14161B] text-[#F4F4F6]"
              >
                Mais recentes
              </option>
              <option
                value="rating_desc"
                className="bg-[#14161B] text-[#F4F4F6]"
              >
                Melhor avaliados
              </option>
              <option
                value="publishedAt_desc"
                className="bg-[#14161B] text-[#F4F4F6]"
              >
                Lançamentos
              </option>
              <option
                value="title_asc"
                className="bg-[#14161B] text-[#F4F4F6]"
              >
                Título (A-Z)
              </option>
              <option
                value="title_desc"
                className="bg-[#14161B] text-[#F4F4F6]"
              >
                Título (Z-A)
              </option>
            </select>
            <ArrowUpDown
              className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#A1A1AA]"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      {/* Result Count (optional) */}
      {typeof totalBooks === "number" &&
        !Number.isNaN(totalBooks) &&
        totalBooks >= 0 && (
          <span className="font-mono text-[11px] text-[#A1A1AA]">
            {totalBooks === 0
              ? "Nenhum livro encontrado"
              : `Exibindo ${totalBooks} ${totalBooks === 1 ? "livro" : "livros"}`}
          </span>
        )}
    </div>
  );
}
