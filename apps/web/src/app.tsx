import * as React from "react";
import { Header } from "./components/header";
import { useDebounce } from "./hooks/use-debounce";

export function App() {
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [isAssistantOpen, setIsAssistantOpen] = React.useState(false);

  const [isMac] = React.useState(() =>
    typeof navigator !== "undefined"
      ? /(Mac|iPhone|iPod|iPad)/i.test(
          navigator.userAgent || navigator.platform || "",
        )
      : true,
  );

  return (
    <div className="min-h-screen bg-[#0C0D10] text-[#F4F4F6]">
      <Header
        searchValue={search}
        onSearchChange={setSearch}
        isAssistantOpen={isAssistantOpen}
        onOpenAssistant={() => setIsAssistantOpen((prev) => !prev)}
      />
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
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
