import * as React from "react";
import { Header } from "./components/header";
import { FilterBar } from "./components/filter-bar";
import { useDebounce } from "./hooks/use-debounce";
import { useGenres } from "./hooks/use-books";
import type { BookSortBy, SortOrder } from "./types/api";

export function App() {
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [isAssistantOpen, setIsAssistantOpen] = React.useState(false);

  // Filter States
  const [selectedGenre, setSelectedGenre] = React.useState<
    string | undefined
  >();
  const [sortBy, setSortBy] = React.useState<BookSortBy>("createdAt");
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("desc");
  const [minRating, setMinRating] = React.useState<number | undefined>();

  // Fetch genres from API
  const { data: genresData, isLoading: isLoadingGenres } = useGenres();
  const genres = genresData?.data || [];

  const [isMac] = React.useState(() =>
    typeof navigator !== "undefined"
      ? /(Mac|iPhone|iPod|iPad)/i.test(
          navigator.userAgent || navigator.platform || "",
        )
      : true,
  );

  const handleSortChange = (newSortBy: BookSortBy, newOrder: SortOrder) => {
    setSortBy(newSortBy);
    setSortOrder(newOrder);
  };

  return (
    <div className="min-h-screen bg-[#0C0D10] text-[#F4F4F6]">
      <Header
        searchValue={search}
        onSearchChange={setSearch}
        isAssistantOpen={isAssistantOpen}
        onOpenAssistant={() => setIsAssistantOpen((prev) => !prev)}
      />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <FilterBar
          genres={genres}
          isLoadingGenres={isLoadingGenres}
          selectedGenre={selectedGenre}
          onSelectGenre={setSelectedGenre}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          minRating={minRating}
          onMinRatingChange={setMinRating}
        />

        <div className="rounded-[14px] border border-[#272A34] bg-[#14161B] p-8 text-center shadow-lg">
          <p className="text-sm text-[#A1A1AA]">
            {debouncedSearch.trim() ? (
              <span>
                Termo pesquisado:{" "}
                <strong className="text-[#F4F4F6]">
                  &quot;{debouncedSearch.trim()}&quot;
                </strong>
              </span>
            ) : (
              <span>
                Pressione{" "}
                <kbd className="rounded-[6px] border border-[#272A34] bg-[#1C1F26] px-1.5 py-0.5 font-mono text-xs text-[#F4F4F6]">
                  {isMac ? "⌘K" : "Ctrl+K"}
                </kbd>{" "}
                ou clique na barra de busca para pesquisar livros no catálogo.
              </span>
            )}
          </p>
          {(selectedGenre || minRating !== undefined) && (
            <p className="mt-2 text-xs text-[#A1A1AA]">
              Filtros ativos:{" "}
              {selectedGenre && (
                <span className="mr-2 font-medium text-[#4F46E5]">
                  Gênero: {selectedGenre}
                </span>
              )}
              {minRating !== undefined && (
                <span className="font-medium text-[#F59E0B]">
                  Nota mínima: ★ {minRating}+
                </span>
              )}
            </p>
          )}
          {isAssistantOpen && (
            <p className="mt-4 inline-flex items-center rounded-full border border-[#7C3AED]/40 bg-[#241C3E] px-3 py-1 text-xs font-medium text-[#C4B5FD]">
              ✨ Assistente IA ativado (painel lateral interativo na Story 3.1).
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
