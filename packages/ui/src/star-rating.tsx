import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils.js";

const STAR_PATH =
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

export const starRatingVariants = cva("inline-flex items-center", {
  variants: {
    mode: {
      compact: "gap-[4px]",
      stars: "gap-[3px]",
    },
    size: {
      sm: "text-[12px]",
      md: "text-[13px]",
      lg: "text-[15px]",
    },
  },
  defaultVariants: {
    mode: "compact",
    size: "md",
  },
});

const STAR_SIZES = {
  compact: {
    sm: 12,
    md: 14,
    lg: 18,
  },
  stars: {
    sm: 14,
    md: 18,
    lg: 22,
  },
} as const;

export interface StarRatingProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof starRatingVariants> {
  rating: number;
  mode?: "compact" | "stars";
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
}

export const StarRating = React.forwardRef<HTMLDivElement, StarRatingProps>(
  (
    {
      className,
      rating,
      mode = "compact",
      size = "md",
      showValue,
      ...props
    },
    ref
  ) => {
    const rawRating = Number.isFinite(rating) ? rating : 0;
    const clampedRating = Math.max(0, Math.min(5, rawRating));
    const formattedRating = clampedRating.toFixed(1);
    const sizeMap = STAR_SIZES[mode] ?? STAR_SIZES.compact;
    const iconSize = sizeMap[size] ?? STAR_SIZES.compact.md;
    const shouldShowValue = showValue ?? (mode === "compact");

    return (
      <div
        ref={ref}
        role="img"
        aria-label={`Avaliação: ${formattedRating} de 5 estrelas`}
        className={cn(starRatingVariants({ mode, size, className }))}
        {...props}
      >
        {mode === "compact" ? (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width={iconSize}
              height={iconSize}
              className="shrink-0 fill-[#F59E0B] text-[#F59E0B]"
              aria-hidden="true"
            >
              <path d={STAR_PATH} fill="currentColor" />
            </svg>
            {shouldShowValue && (
              <span className="font-semibold text-[#18181B] dark:text-[#F4F4F6] leading-none">
                {formattedRating}
              </span>
            )}
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-[3px]">
              {Array.from({ length: 5 }, (_, i) => {
                const fill = Math.max(0, Math.min(1, clampedRating - i));
                const fillPercent = Math.round(fill * 100);

                if (fillPercent >= 100) {
                  return (
                    <span
                      key={i}
                      className="relative inline-flex items-center justify-center shrink-0"
                      style={{ width: iconSize, height: iconSize }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width={iconSize}
                        height={iconSize}
                        className="fill-[#F59E0B] text-[#F59E0B]"
                        aria-hidden="true"
                      >
                        <path d={STAR_PATH} fill="currentColor" />
                      </svg>
                    </span>
                  );
                }

                if (fillPercent <= 0) {
                  return (
                    <span
                      key={i}
                      className="relative inline-flex items-center justify-center shrink-0"
                      style={{ width: iconSize, height: iconSize }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width={iconSize}
                        height={iconSize}
                        className="fill-[#E4E4E7] dark:fill-[#272A34] text-[#E4E4E7] dark:text-[#272A34]"
                        aria-hidden="true"
                      >
                        <path d={STAR_PATH} fill="currentColor" />
                      </svg>
                    </span>
                  );
                }

                return (
                  <span
                    key={i}
                    className="relative inline-flex items-center justify-center shrink-0"
                    style={{ width: iconSize, height: iconSize }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      width={iconSize}
                      height={iconSize}
                      className="absolute inset-0 fill-[#E4E4E7] dark:fill-[#272A34] text-[#E4E4E7] dark:text-[#272A34]"
                      aria-hidden="true"
                    >
                      <path d={STAR_PATH} fill="currentColor" />
                    </svg>
                    <span
                      className="absolute inset-y-0 left-0 overflow-hidden"
                      style={{ width: `${fillPercent}%` }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width={iconSize}
                        height={iconSize}
                        className="fill-[#F59E0B] text-[#F59E0B]"
                        style={{ minWidth: iconSize, minHeight: iconSize }}
                        aria-hidden="true"
                      >
                        <path d={STAR_PATH} fill="currentColor" />
                      </svg>
                    </span>
                  </span>
                );
              })}
            </div>
            {shouldShowValue && (
              <span className="font-semibold text-[#18181B] dark:text-[#F4F4F6] leading-none ml-1">
                {formattedRating}
              </span>
            )}
          </>
        )}
      </div>
    );
  }
);

StarRating.displayName = "StarRating";
