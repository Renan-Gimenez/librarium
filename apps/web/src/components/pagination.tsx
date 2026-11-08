import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPageNumbers } from "./pagination-utils";

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems?: number;
  itemsPerPage?: number;
  onPageChange: (newPage: number) => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  className = "",
}: PaginationProps) {
  if (!totalPages || totalPages <= 1 || Number.isNaN(totalPages)) {
    return null;
  }

  const safePage = Number.isFinite(page)
    ? Math.max(1, Math.min(Math.floor(page), totalPages))
    : 1;

  const pages = getPageNumbers(safePage, totalPages);

  return (
    <nav
      role="navigation"
      aria-label="Paginação do catálogo"
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 pb-2 ${className}`}
    >
      {/* Pages Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          aria-label="Página anterior"
          className="flex h-8 items-center gap-1 rounded-[8px] border border-[#272A34] bg-[#14161B] px-3 text-xs font-medium text-[#F4F4F6] transition-colors hover:border-[#3A3E4A] hover:bg-[#1C1F26] disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Anterior</span>
        </button>

        <div className="flex items-center gap-1 sm:gap-1.5">
          {pages.map((p, index) => {
            if (p === "...") {
              return (
                <span
                  key={`ellipsis-${index}`}
                  aria-hidden="true"
                  className="flex h-8 w-6 items-center justify-center text-xs text-[#A1A1AA]"
                >
                  ...
                </span>
              );
            }

            const isCurrent = p === safePage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-label={`Ir para a página ${p}`}
                aria-current={isCurrent ? "page" : undefined}
                className={`flex h-8 w-8 items-center justify-center rounded-[8px] text-xs transition-colors ${
                  isCurrent
                    ? "bg-[#F4F4F6] font-semibold text-[#0C0D10] shadow-sm"
                    : "border border-[#272A34] bg-[#14161B] font-medium text-[#F4F4F6] hover:border-[#3A3E4A] hover:bg-[#1C1F26]"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          aria-label="Próxima página"
          className="flex h-8 items-center gap-1 rounded-[8px] border border-[#272A34] bg-[#14161B] px-3 text-xs font-medium text-[#F4F4F6] transition-colors hover:border-[#3A3E4A] hover:bg-[#1C1F26] disabled:pointer-events-none disabled:opacity-40"
        >
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Meta Summary */}
      <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
        <span>
          Página <strong className="text-[#F4F4F6]">{safePage}</strong> de{" "}
          <strong className="text-[#F4F4F6]">{totalPages}</strong>
        </span>
        {totalItems !== undefined && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {Math.max(0, totalItems)} {totalItems === 1 ? "livro" : "livros"}
              {itemsPerPage ? ` (${itemsPerPage} por pág.)` : ""}
            </span>
          </>
        )}
      </div>
    </nav>
  );
}
