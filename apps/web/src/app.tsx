import * as React from "react";
import { Header } from "./components/header";
import { FilterBar } from "./components/filter-bar";
import { BookGrid } from "./components/book-grid";
import { Pagination } from "./components/pagination";
import { BookDetailsModal } from "./components/book-details-modal";
import { useDebounce } from "./hooks/use-debounce";
import { useBooks, useGenres } from "./hooks/use-books";
import type { Book, BookSortBy, SortOrder } from "./types/api";

const PAGE_LIMIT = 10;

export function App() {
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [isAssistantOpen, setIsAssistantOpen] = React.useState(false);
  const [selectedBook, setSelectedBook] = React.useState<Book | null>(null);

  // Filter States
  const [selectedGenre, setSelectedGenre] = React.useState<
    string | undefined
  >();
  const [sortBy, setSortBy] = React.useState<BookSortBy>("createdAt");
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("desc");
  const [minRating, setMinRating] = React.useState<number | undefined>();
  const [page, setPage] = React.useState(1);

  // Fetch genres from API
  const { data: genresData, isLoading: isLoadingGenres } = useGenres();
  const genres = genresData?.data || [];

  // Fetch books from API with active filters and pagination
  const {
    data: booksData,
    isLoading: isLoadingBooks,
    isError: isErrorBooks,
    refetch: refetchBooks,
  } = useBooks({
    search: debouncedSearch.trim() || undefined,
    genre: selectedGenre,
    minRating,
    sortBy,
    order: sortOrder,
    page,
    limit: PAGE_LIMIT,
  });

  const books = booksData?.data || [];
  const meta = booksData?.meta;
  const totalBooks = meta?.total;
  const totalPages = meta?.totalPages || 0;

  // Auto-clamp page if totalPages is reduced (e.g. backend data change or filter reduction)
  if (totalPages > 0 && page > totalPages) {
    setPage(totalPages);
  }

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleSelectGenre = (genreSlug: string | undefined) => {
    setSelectedGenre(genreSlug);
    setPage(1);
  };

  const handleSortChange = (newSortBy: BookSortBy, newOrder: SortOrder) => {
    setSortBy(newSortBy);
    setSortOrder(newOrder);
    setPage(1);
  };

  const handleMinRatingChange = (newMinRating: number | undefined) => {
    setMinRating(newMinRating);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch("");
    setSelectedGenre(undefined);
    setMinRating(undefined);
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (!Number.isFinite(newPage)) return;
    const maxPage = totalPages > 0 ? totalPages : 1;
    const clampedPage = Math.max(1, Math.min(Math.floor(newPage), maxPage));
    setPage(clampedPage);
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSelectBook = (book: Book) => {
    setSelectedBook(book);
  };

  const hasActiveFilters = Boolean(
    selectedGenre ||
      minRating !== undefined ||
      sortBy !== "createdAt" ||
      sortOrder !== "desc",
  );

  return (
    <div className="min-h-screen bg-[#0C0D10] text-[#F4F4F6]">
      <Header
        searchValue={search}
        onSearchChange={handleSearchChange}
        isAssistantOpen={isAssistantOpen}
        onOpenAssistant={() => setIsAssistantOpen((prev) => !prev)}
      />

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <FilterBar
          genres={genres}
          isLoadingGenres={isLoadingGenres}
          selectedGenre={selectedGenre}
          onSelectGenre={handleSelectGenre}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          minRating={minRating}
          onMinRatingChange={handleMinRatingChange}
          totalBooks={totalBooks}
        />

        {isAssistantOpen && (
          <div
            role="status"
            className="flex items-center justify-between rounded-[10px] border border-[#7C3AED]/40 bg-[#241C3E]/80 px-4 py-2.5 text-xs font-medium text-[#C4B5FD] backdrop-blur-xs"
          >
            <span>✨ Assistente IA ativado (painel lateral interativo no Epic 3).</span>
            <button
              type="button"
              onClick={() => setIsAssistantOpen(false)}
              className="text-[#C4B5FD]/70 hover:text-white"
            >
              Fechar
            </button>
          </div>
        )}

        <BookGrid
          books={books}
          isLoading={isLoadingBooks}
          isError={isErrorBooks}
          onRetry={() => refetchBooks()}
          onSelectBook={handleSelectBook}
          searchQuery={debouncedSearch}
          hasFilters={hasActiveFilters}
          onClearFilters={handleClearFilters}
          onOpenAssistant={() => setIsAssistantOpen(true)}
          skeletonCount={PAGE_LIMIT}
        />

        {meta && totalPages > 1 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalBooks}
            itemsPerPage={meta.limit}
            onPageChange={handlePageChange}
          />
        )}

        <BookDetailsModal
          book={selectedBook}
          isOpen={Boolean(selectedBook)}
          onClose={() => setSelectedBook(null)}
          onAskAI={(book) => {
            setSelectedBook(null);
            setIsAssistantOpen(true);
            console.info("Ask AI about:", book.title);
          }}
        />
      </main>
    </div>
  );
}
