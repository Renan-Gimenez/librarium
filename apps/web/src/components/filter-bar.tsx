import * as React from "react";
import { ArrowUpDown, Star } from "lucide-react";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Horizontal Chips List */}
        <div
          role="group"
          aria-label="Filtros de gênero"
          aria-busy={isLoadingGenres}
          className="flex flex-1 items-center gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
