import "../test-setup";
import { describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useDebounce } from "./use-debounce";

describe("useDebounce hook", () => {
  it("initializes immediately with the provided value", () => {
    const { result } = renderHook(() => useDebounce("initial", 300));
    expect(result.current).toBe("initial");
  });

  it("delays updating the debounced value until after the specified delay", async () => {
    let currentVal = "first";
    const { result, rerender } = renderHook(() => useDebounce(currentVal, 50));

    expect(result.current).toBe("first");

    currentVal = "second";
    rerender();

    expect(result.current).toBe("first");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(result.current).toBe("second");
  });

  it("cancels previous timeout if value changes again before delay expires", async () => {
    let currentVal = "a";
    const { result, rerender } = renderHook(() => useDebounce(currentVal, 50));

    expect(result.current).toBe("a");

    currentVal = "b";
    rerender();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    currentVal = "c";
    rerender();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(result.current).toBe("c");
  });
});
