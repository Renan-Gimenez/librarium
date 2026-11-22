import * as React from "react";
import { cn } from "./lib/utils.js";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-[42px] w-full rounded-[10px] border border-[#E4E4E7] dark:border-[#272A34] bg-white dark:bg-[#14161B] px-[14px] text-[14px] text-[#18181B] dark:text-[#F4F4F6] placeholder:text-[#71717A] dark:placeholder:text-[#A1A1AA] transition-colors focus:outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] focus-visible:outline-none focus-visible:border-[#4F46E5] focus-visible:ring-1 focus-visible:ring-[#4F46E5] disabled:cursor-not-allowed disabled:opacity-[0.45]",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[96px] w-full rounded-[10px] border border-[#E4E4E7] dark:border-[#272A34] bg-white dark:bg-[#14161B] p-[12px] text-[13px] leading-[1.5] text-[#18181B] dark:text-[#F4F4F6] placeholder:text-[#71717A] dark:placeholder:text-[#A1A1AA] transition-colors focus:outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] focus-visible:outline-none focus-visible:border-[#4F46E5] focus-visible:ring-1 focus-visible:ring-[#4F46E5] disabled:cursor-not-allowed disabled:opacity-[0.45]",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
