export interface TypingIndicatorProps {
  className?: string;
  label?: string;
}

export function TypingIndicator({
  className = "",
  label = "gerando resposta...",
}: TypingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-[12px] border border-[#272A34] bg-[#14161B] px-3.5 py-2.5 text-[#A1A1AA] ${className}`}
    >
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#A1A1AA]" />
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#A1A1AA]"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#A1A1AA]"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="font-ui text-[12px] leading-none text-[#A1A1AA]">
        {label}
      </span>
    </div>
  );
}
