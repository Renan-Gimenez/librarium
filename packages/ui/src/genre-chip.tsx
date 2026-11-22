import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils.js";

export const genreChipVariants = cva(
  "inline-flex items-center justify-center rounded-full px-[16px] py-[8px] text-[13px] font-medium border transition-colors cursor-pointer outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#4F46E5] disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      active: {
        true: "bg-[#EEF0FE] dark:bg-[#23244A] border-[#4F46E5] text-[#4F46E5] hover:bg-[#EEF0FE]/90 dark:hover:bg-[#23244A]/90",
        false:
          "bg-white dark:bg-[#14161B] border-[#E4E4E7] dark:border-[#272A34] text-[#71717A] dark:text-[#A1A1AA] hover:bg-[#F4F2EE] dark:hover:bg-[#1C1F26]",
      },
    },
    defaultVariants: {
      active: false,
    },
  }
);

export interface GenreChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof genreChipVariants> {
  active?: boolean;
}

export const GenreChip = React.forwardRef<HTMLButtonElement, GenreChipProps>(
  (
    { className, active = false, type = "button", onMouseUp, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(genreChipVariants({ active, className }))}
        aria-pressed={active}
        onMouseUp={(e) => {
          e.currentTarget.blur();
          onMouseUp?.(e);
        }}
        {...props}
      />
    );
  }
);

GenreChip.displayName = "GenreChip";
