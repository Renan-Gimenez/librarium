import { describe, expect, it } from "bun:test";
import { cn } from "./utils.js";

describe("cn utility", () => {
  it("resolves conflicting Tailwind classes by giving precedence to the last class", () => {
    const result = cn("px-2 py-1", "px-4");
    expect(result).toBe("py-1 px-4");
  });

  it("handles conditional classes and filters falsy values", () => {
    const isHidden = false;
    const result = cn("base", isHidden && "hidden", null, undefined, "active");
    expect(result).toBe("base active");
  });

  it("handles arrays and nested class definitions", () => {
    const isCompact = false;
    const result = cn(["font-bold", ["text-sm", isCompact && "p-0"]], "text-base");
    expect(result).toBe("font-bold text-base");
  });
});
