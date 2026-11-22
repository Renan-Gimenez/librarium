import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils.js";

export const skeletonVariants = cva(
  "animate-pulse rounded-md bg-[#F4F2EE] dark:bg-[#1C1F26]"
);

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, "aria-hidden": ariaHidden = true, ...props }, ref) => {
    return (
      <div
        ref={ref}
        aria-hidden={ariaHidden}
        className={cn(skeletonVariants(), className)}
        {...props}
      />
    );
  }
);

Skeleton.displayName = "Skeleton";
