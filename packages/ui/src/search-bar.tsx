import * as React from "react";
import { cn } from "./lib/utils.js";

export type SearchBarProps = React.HTMLAttributes<HTMLDivElement>;

export const SearchBarRoot = React.forwardRef<HTMLDivElement, SearchBarProps>(
  ({ className, role = "search", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role={role}
        className={cn(
          "flex h-[42px] w-full items-center gap-[10px] rounded-[10px] border border-[#E4E4E7] dark:border-[#272A34] bg-white dark:bg-[#14161B] px-[14px] transition-colors focus-within:border-[#4F46E5] focus-within:ring-1 focus-within:ring-[#4F46E5]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SearchBarRoot.displayName = "SearchBar";

export type SearchBarIconProps = React.HTMLAttributes<HTMLSpanElement>;

export const SearchBarIcon = React.forwardRef<
  HTMLSpanElement,
  SearchBarIconProps
>(({ className, children, ...props }, ref) => {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-[#71717A] dark:text-[#A1A1AA]",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
});

SearchBarIcon.displayName = "SearchBar.Icon";

export type SearchBarInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const SearchBarInput = React.forwardRef<
  HTMLInputElement,
  SearchBarInputProps
>(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex-1 h-full w-full bg-transparent border-0 p-0 text-[14px] text-[#18181B] dark:text-[#F4F4F6] placeholder:text-[#71717A] dark:placeholder:text-[#A1A1AA] outline-none focus:outline-none focus:ring-0",
        className
      )}
      {...props}
    />
  );
});

SearchBarInput.displayName = "SearchBar.Input";

export type SearchBarShortcutProps = React.HTMLAttributes<HTMLElement>;

export const SearchBarShortcut = React.forwardRef<
  HTMLElement,
  SearchBarShortcutProps
>(({ className, children, ...props }, ref) => {
  return (
    <kbd
      ref={ref}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-[6px] border border-[#E4E4E7] dark:border-[#272A34] bg-[#F4F2EE] dark:bg-[#1C1F26] px-[7px] py-[2px] font-mono text-[11px] font-normal text-[#71717A] dark:text-[#A1A1AA]",
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
});

SearchBarShortcut.displayName = "SearchBar.Shortcut";

export const SearchBar = Object.assign(SearchBarRoot, {
  Icon: SearchBarIcon,
  Input: SearchBarInput,
  Shortcut: SearchBarShortcut,
});
