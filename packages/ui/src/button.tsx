import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils.js";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#14161B] disabled:pointer-events-none disabled:opacity-[0.45]",
  {
    variants: {
      variant: {
        primary: "bg-[#4F46E5] text-white hover:bg-[#4338CA]",
        secondary:
          "border border-[#E4E4E7] dark:border-[#272A34] bg-white dark:bg-[#14161B] text-[#18181B] dark:text-[#F4F4F6] hover:bg-[#F4F2EE] dark:hover:bg-[#1C1F26]",
        outline:
          "border border-[#D4D4D8] dark:border-[#3A3E4A] bg-white dark:bg-[#14161B] text-[#18181B] dark:text-[#F4F4F6] hover:bg-[#F4F2EE] dark:hover:bg-[#1C1F26]",
        ghost:
          "bg-[#EEF0FE] dark:bg-[#23244A] text-[#4F46E5] hover:bg-[#EEF0FE]/80 dark:hover:bg-[#23244A]/80",
        ai: "bg-[#7C3AED] text-white hover:bg-[#6D28D9]",
      },
      size: {
        sm: "px-[12px] py-[6px] text-[13px]",
        md: "px-[18px] py-[10px] text-[14px]",
        lg: "px-[22px] py-[12px] text-[15px]",
        icon: "h-[38px] w-[38px] p-0 shrink-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
