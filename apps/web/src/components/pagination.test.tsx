import { describe, expect, it, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { Pagination } from "./pagination";
import { getPageNumbers } from "./pagination-utils";

describe("Pagination Component", () => {
  describe("getPageNumbers helper", () => {
    it("returns direct sequence when totalPages <= 7", () => {
      expect(getPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
      expect(getPageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("handles beginning range when totalPages > 7", () => {
      expect(getPageNumbers(2, 10)).toEqual([1, 2, 3, 4, 5, "...", 10]);
    });

    it("handles end range when totalPages > 7", () => {
      expect(getPageNumbers(9, 10)).toEqual([1, "...", 6, 7, 8, 9, 10]);
    });

    it("handles middle range with ellipses on both sides", () => {
      expect(getPageNumbers(6, 12)).toEqual([1, "...", 5, 6, 7, "...", 12]);
    });

    it("handles edge cases: negative totalPages, 0, or NaN safely", () => {
      expect(getPageNumbers(1, 0)).toEqual([]);
      expect(getPageNumbers(1, -5)).toEqual([]);
      expect(getPageNumbers(1, Number.NaN)).toEqual([]);
    });

    it("clamps out-of-range currentPage gracefully", () => {
      expect(getPageNumbers(0, 5)).toEqual([1, 2, 3, 4, 5]);
      expect(getPageNumbers(-2, 5)).toEqual([1, 2, 3, 4, 5]);
      expect(getPageNumbers(15, 10)).toEqual([1, "...", 6, 7, 8, 9, 10]);
    });
  });

  describe("Rendering and interactions", () => {
    it("returns null when totalPages <= 1", () => {
      const { container } = render(
        <Pagination page={1} totalPages={1} onPageChange={() => {}} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("returns null when totalPages is 0, negative or NaN", () => {
      const { container: c0 } = render(
        <Pagination page={1} totalPages={0} onPageChange={() => {}} />,
      );
      expect(c0.firstChild).toBeNull();

      const { container: cNeg } = render(
        <Pagination page={1} totalPages={-2} onPageChange={() => {}} />,
      );
      expect(cNeg.firstChild).toBeNull();

      const { container: cNan } = render(
        <Pagination page={1} totalPages={Number.NaN} onPageChange={() => {}} />,
      );
      expect(cNan.firstChild).toBeNull();
    });

    it("safely clamps out-of-range page when rendering", () => {
      render(<Pagination page={10} totalPages={5} onPageChange={() => {}} />);
      // Should clamp to page 5 as active
      const page5 = screen.getByRole("button", { name: "Ir para a página 5" });
      expect(page5.getAttribute("aria-current")).toBe("page");
      expect(
        screen.getByText(
          (_, element) =>
            element?.tagName.toLowerCase() === "span" &&
            element?.textContent?.replace(/\s+/g, " ").trim() === "Página 5 de 5",
        ),
      ).toBeDefined();
    });

    it("disables 'Anterior' on page 1 and enables 'Próxima'", () => {
      render(<Pagination page={1} totalPages={5} onPageChange={() => {}} />);

      const prev = screen.getByRole("button", { name: "Página anterior" });
      const next = screen.getByRole("button", { name: "Próxima página" });

      expect(prev.hasAttribute("disabled")).toBe(true);
      expect(next.hasAttribute("disabled")).toBe(false);
    });

    it("disables 'Próxima' on last page", () => {
      render(<Pagination page={5} totalPages={5} onPageChange={() => {}} />);

      const next = screen.getByRole("button", { name: "Próxima página" });
      expect(next.hasAttribute("disabled")).toBe(true);
    });

    it("calls onPageChange with previous and next pages", () => {
      const onPageChange = mock();
      render(
        <Pagination page={2} totalPages={5} onPageChange={onPageChange} />,
      );

      const prev = screen.getByRole("button", { name: "Página anterior" });
      fireEvent.click(prev);
      expect(onPageChange).toHaveBeenCalledWith(1);

      const next = screen.getByRole("button", { name: "Próxima página" });
      fireEvent.click(next);
      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it("calls onPageChange when clicking a specific page button", () => {
      const onPageChange = mock();
      render(
        <Pagination page={1} totalPages={5} onPageChange={onPageChange} />,
      );

      const page3 = screen.getByRole("button", { name: "Ir para a página 3" });
      fireEvent.click(page3);
      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it("highlights active page with aria-current='page'", () => {
      render(<Pagination page={3} totalPages={5} onPageChange={() => {}} />);

      const page3 = screen.getByRole("button", { name: "Ir para a página 3" });
      expect(page3.getAttribute("aria-current")).toBe("page");

      const page2 = screen.getByRole("button", { name: "Ir para a página 2" });
      expect(page2.getAttribute("aria-current")).toBeNull();
    });

    it("renders meta count information", () => {
      render(
        <Pagination
          page={2}
          totalPages={4}
          totalItems={42}
          itemsPerPage={12}
          onPageChange={() => {}}
        />,
      );

      expect(screen.getByText("42 livros (12 por pág.)")).toBeDefined();
    });

    it("renders ellipsis elements when totalPages > 7", () => {
      render(
        <Pagination page={6} totalPages={12} onPageChange={() => {}} />,
      );

      const ellipses = screen.getAllByText("...");
      expect(ellipses.length).toBe(2);
      expect(ellipses[0].getAttribute("aria-hidden")).toBe("true");
    });

    it("does not trigger onPageChange when clicking disabled buttons", () => {
      const onPageChange = mock();
      render(
        <Pagination page={1} totalPages={5} onPageChange={onPageChange} />,
      );

      const prev = screen.getByRole("button", { name: "Página anterior" });
      fireEvent.click(prev);
      expect(onPageChange).not.toHaveBeenCalled();
    });
  });
});
