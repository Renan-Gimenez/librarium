import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils.js";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[6px] px-[8px] py-[3px] text-[10px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[#4F46E5] text-white",
        secondary:
          "bg-[#F4F2EE] dark:bg-[#1C1F26] text-[#18181B] dark:text-[#F4F4F6]",
        genre:
          "bg-[#EEF0FE] dark:bg-[#23244A] text-[#4F46E5] uppercase tracking-[0.6px] font-semibold",
        ai: "bg-[#F3EEFE] dark:bg-[#241C3E] text-[#7C3AED] font-semibold",
        outline:
          "border border-[#E4E4E7] dark:border-[#272A34] text-[#18181B] dark:text-[#F4F4F6]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, className }))}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";
