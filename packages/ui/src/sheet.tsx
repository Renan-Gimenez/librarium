import * as React from "react";
import { createPortal } from "react-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils.js";

interface SheetContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
}

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const context = React.useContext(SheetContext);
  if (!context) {
    throw new Error("Sheet compound components must be used within a Sheet");
  }
  return context;
}

export interface SheetProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Sheet({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
}: SheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  const titleId = React.useId();
  const descriptionId = React.useId();

  return (
    <SheetContext.Provider
      value={{ open, onOpenChange: handleOpenChange, titleId, descriptionId }}
    >
      {children}
    </SheetContext.Provider>
  );
}

export interface SheetTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const SheetTrigger = React.forwardRef<
  HTMLButtonElement,
  SheetTriggerProps
>(({ onClick, asChild, ...props }, ref) => {
  const { onOpenChange } = useSheetContext();
  void asChild;

  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        onClick?.(e);
        onOpenChange(true);
      }}
      {...props}
    />
  );
});

SheetTrigger.displayName = "SheetTrigger";

export function SheetPortal({ children }: { children: React.ReactNode }) {
  const { open } = useSheetContext();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!open) return null;
  if (!mounted || typeof document === "undefined") {
    return <>{children}</>;
  }

  return createPortal(children, document.body);
}

export const SheetOverlay = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, onClick, ...props }, ref) => {
  const { onOpenChange } = useSheetContext();

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="sheet-overlay"
      onClick={(e) => {
        onClick?.(e);
        onOpenChange(false);
      }}
      className={cn(
        "fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in",
        className
      )}
      {...props}
    />
  );
});

SheetOverlay.displayName = "SheetOverlay";

export const sheetVariants = cva(
  "fixed z-50 flex flex-col bg-[#14161B] text-[#F4F4F6] shadow-2xl transition ease-in-out duration-300 focus:outline-none",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b border-[#272A34] animate-in slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t border-[#272A34] animate-in slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-[420px] max-w-[95vw] border-r border-[#272A34] animate-in slide-in-from-left",
        right:
          "inset-y-0 right-0 h-full w-[420px] max-w-[95vw] border-l border-[#272A34] animate-in slide-in-from-right",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
);

export interface SheetContentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof sheetVariants> {
  hideCloseButton?: boolean;
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  (
    {
      side = "right",
      className,
      children,
      hideCloseButton = false,
      ...props
    },
    ref
  ) => {
    const { open, onOpenChange, titleId, descriptionId } = useSheetContext();
    const contentRef = React.useRef<HTMLDivElement>(null);
    const previouslyFocusedElementRef = React.useRef<HTMLElement | null>(null);
    const onOpenChangeRef = React.useRef(onOpenChange);

    React.useEffect(() => {
      onOpenChangeRef.current = onOpenChange;
    }, [onOpenChange]);

    React.useImperativeHandle(ref, () => contentRef.current!);

    // Focus trap, scroll lock, and Esc key handler
    React.useEffect(() => {
      if (!open) return;

      previouslyFocusedElementRef.current =
        document.activeElement as HTMLElement | null;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          // If another dialog modal is open on top of the sheet, let the dialog handle Escape
          const activeDialog = document.querySelector('[role="dialog"][data-state="open"]');
          if (activeDialog && contentRef.current && !contentRef.current.contains(activeDialog)) {
            return;
          }
          event.preventDefault();
          onOpenChangeRef.current(false);
          return;
        }

        // WAI-ARIA Focus Trap for Tab and Shift+Tab
        if (event.key === "Tab" && contentRef.current) {
          // If another modal or dialog has opened on top of sheet, do not steal its focus
          const activeEl = document.activeElement;
          const isAnotherModalActive =
            activeEl &&
            activeEl.closest('[role="dialog"]') &&
            !contentRef.current.contains(activeEl);

          if (isAnotherModalActive) {
            return;
          }

          const focusableElements =
            contentRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );

          if (focusableElements.length === 0) {
            event.preventDefault();
            return;
          }

          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (!contentRef.current.contains(activeEl)) {
            event.preventDefault();
            firstElement?.focus();
            return;
          }

          if (event.shiftKey) {
            if (
              document.activeElement === firstElement ||
              document.activeElement === contentRef.current
            ) {
              event.preventDefault();
              lastElement?.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              event.preventDefault();
              firstElement?.focus();
            }
          }
        }
      };

      // Body scroll lock
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      document.addEventListener("keydown", handleKeyDown);

      // Initial focus on sheet content
      contentRef.current?.focus();

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = originalOverflow;
        previouslyFocusedElementRef.current?.focus();
      };
    }, [open]);

    return (
      <SheetPortal>
        <SheetOverlay />
        <div
          ref={contentRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={props["aria-describedby"] ?? descriptionId}
          tabIndex={-1}
          className={cn(sheetVariants({ side }), className)}
          {...props}
        >
          {children}
          {!hideCloseButton && (
            <SheetClose className="absolute right-4 top-4 rounded-full p-2 text-[#A1A1AA] transition-colors hover:bg-[#1C1F26] hover:text-[#F4F4F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span className="sr-only">Fechar</span>
            </SheetClose>
          )}
        </div>
      </SheetPortal>
    );
  }
);

SheetContent.displayName = "SheetContent";

export const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 p-6 border-b border-[#272A34] text-left",
      className
    )}
    {...props}
  />
);

SheetHeader.displayName = "SheetHeader";

export const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-4 border-t border-[#272A34]",
      className
    )}
    {...props}
  />
);

SheetFooter.displayName = "SheetFooter";

export const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  const { titleId } = useSheetContext();

  return (
    <h2
      ref={ref}
      id={titleId}
      className={cn(
        "font-serif text-lg font-semibold leading-tight text-[#F4F4F6]",
        className
      )}
      {...props}
    />
  );
});

SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { descriptionId } = useSheetContext();

  return (
    <p
      ref={ref}
      id={descriptionId}
      className={cn("text-xs text-[#A1A1AA]", className)}
      {...props}
    />
  );
});

SheetDescription.displayName = "SheetDescription";

export const SheetClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, onClick, ...props }, ref) => {
  const { onOpenChange } = useSheetContext();

  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        onClick?.(e);
        onOpenChange(false);
      }}
      className={cn("cursor-pointer", className)}
      {...props}
    />
  );
});

SheetClose.displayName = "SheetClose";
