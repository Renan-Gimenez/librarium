import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  GenreChip,
  genreChipVariants,
  StarRating,
  starRatingVariants,
  Skeleton,
  skeletonVariants,
} from "./index.js";

type ForwardRefElement = {
  ref?: unknown;
  props: { ref?: unknown; [key: string]: unknown };
};

const getElementRef = (el: ForwardRefElement) => el.props.ref ?? el.ref;

describe("GenreChip component", () => {
  it("renders inactive chip with default styling matching .pen specification", () => {
    const html = renderToString(<GenreChip>Fiction</GenreChip>);
    expect(html).toContain("Fiction");
    expect(html).toContain("rounded-full");
    expect(html).toContain("px-[16px]");
    expect(html).toContain("py-[8px]");
    expect(html).toContain("text-[13px]");
    expect(html).toContain("font-medium");
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-[#14161B]");
    expect(html).toContain("border-[#E4E4E7]");
    expect(html).toContain("dark:border-[#272A34]");
    expect(html).toContain("text-[#71717A]");
    expect(html).toContain("dark:text-[#A1A1AA]");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("renders active chip with accent styling matching .pen specification", () => {
    const html = renderToString(<GenreChip active>Science</GenreChip>);
    expect(html).toContain("Science");
    expect(html).toContain("bg-[#EEF0FE]");
    expect(html).toContain("dark:bg-[#23244A]");
    expect(html).toContain("border-[#4F46E5]");
    expect(html).toContain("text-[#4F46E5]");
    expect(html).toContain('aria-pressed="true"');
  });

  it("handles disabled state and forwards button props", () => {
    const html = renderToString(
      <GenreChip disabled data-testid="chip-test">
        Fantasy
      </GenreChip>
    );
    expect(html).toContain("disabled");
    expect(html).toContain("disabled:opacity-50");
    expect(html).toContain('data-testid="chip-test"');
  });

  it("forwards ref to button element", () => {
    const ref = React.createRef<HTMLButtonElement>();
    const element = (GenreChip as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({ children: "Ref Test" }, ref);
    expect(getElementRef(element)).toBe(ref);
  });

  it("merges custom className with genreChipVariants", () => {
    const html = renderToString(
      <GenreChip className="custom-genre-chip">Custom</GenreChip>
    );
    expect(html).toContain("custom-genre-chip");
    expect(html).toContain("rounded-full");
  });

  it("exposes genreChipVariants helper directly", () => {
    const activeClasses = genreChipVariants({ active: true });
    expect(activeClasses).toContain("bg-[#EEF0FE]");
    expect(activeClasses).toContain("border-[#4F46E5]");

    const inactiveClasses = genreChipVariants({ active: false });
    expect(inactiveClasses).toContain("bg-white");
    expect(inactiveClasses).toContain("border-[#E4E4E7]");
  });
});

describe("StarRating component", () => {
  it("renders compact mode with amber star and formatted numeric value", () => {
    const html = renderToString(<StarRating rating={4.7} mode="compact" />);
    expect(html).toContain("4.7");
    expect(html).toContain("#F59E0B");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Avaliação: 4.7 de 5 estrelas"');
  });

  it("renders 5 stars mode with filled, empty and fractional stars", () => {
    const html = renderToString(<StarRating rating={3.5} mode="stars" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Avaliação: 3.5 de 5 estrelas"');
    // Filled amber stars
    expect(html).toContain("#F59E0B");
    // Empty stars with neutral border color
    expect(html).toContain("#E4E4E7");
    expect(html).toContain("dark:fill-[#272A34]");
    // Fractional star width (50% for 3.5 rating on 4th star)
    expect(html).toContain("width:50%");
  });

  it("clamps ratings above 5.0 to 5.0", () => {
    const html = renderToString(<StarRating rating={7.2} mode="compact" />);
    expect(html).toContain("5.0");
    expect(html).toContain('aria-label="Avaliação: 5.0 de 5 estrelas"');
  });

  it("clamps ratings below 0.0 to 0.0", () => {
    const html = renderToString(<StarRating rating={-1} mode="compact" />);
    expect(html).toContain("0.0");
    expect(html).toContain('aria-label="Avaliação: 0.0 de 5 estrelas"');
  });

  it("handles non-finite ratings gracefully by falling back to 0.0", () => {
    const html = renderToString(
      <StarRating rating={NaN as unknown as number} mode="compact" />
    );
    expect(html).toContain("0.0");
    expect(html).toContain('aria-label="Avaliação: 0.0 de 5 estrelas"');
  });

  it("renders numeric value in stars mode when showValue is true", () => {
    const html = renderToString(
      <StarRating rating={4} mode="stars" showValue />
    );
    expect(html).toContain("4.0");
    expect(html).toContain("#F59E0B");
  });

  it("applies size variants correctly", () => {
    const sm = renderToString(<StarRating rating={4.5} size="sm" />);
    expect(sm).toContain("text-[12px]");

    const md = renderToString(<StarRating rating={4.5} size="md" />);
    expect(md).toContain("text-[13px]");

    const lg = renderToString(<StarRating rating={4.5} size="lg" />);
    expect(lg).toContain("text-[15px]");
  });

  it("forwards ref to container div", () => {
    const ref = React.createRef<HTMLDivElement>();
    const element = (StarRating as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({ rating: 4.5 }, ref);
    expect(getElementRef(element)).toBe(ref);
  });

  it("merges custom className with starRatingVariants", () => {
    const html = renderToString(
      <StarRating rating={4.5} className="custom-star-rating" />
    );
    expect(html).toContain("custom-star-rating");
    expect(html).toContain("inline-flex");
  });

  it("exposes starRatingVariants helper directly", () => {
    const compactClasses = starRatingVariants({ mode: "compact" });
    expect(compactClasses).toContain("gap-[4px]");

    const starsClasses = starRatingVariants({ mode: "stars" });
    expect(starsClasses).toContain("gap-[3px]");
  });
});

describe("Skeleton component", () => {
  it("renders with animate-pulse and surface-muted background tokens", () => {
    const html = renderToString(
      <Skeleton className="h-[300px] w-[200px] rounded-lg" />
    );
    expect(html).toContain("animate-pulse");
    expect(html).toContain("bg-[#F4F2EE]");
    expect(html).toContain("dark:bg-[#1C1F26]");
    expect(html).toContain("h-[300px]");
    expect(html).toContain("w-[200px]");
    expect(html).toContain("rounded-lg");
  });

  it("renders default skeleton with default rounded-md class", () => {
    const html = renderToString(<Skeleton />);
    expect(html).toContain("animate-pulse");
    expect(html).toContain("rounded-md");
    expect(html).toContain("bg-[#F4F2EE]");
  });

  it("forwards ref to div element", () => {
    const ref = React.createRef<HTMLDivElement>();
    const element = (Skeleton as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({}, ref);
    expect(getElementRef(element)).toBe(ref);
  });

  it("exposes skeletonVariants helper directly", () => {
    const classes = skeletonVariants();
    expect(classes).toContain("animate-pulse");
    expect(classes).toContain("bg-[#F4F2EE]");
  });
});
