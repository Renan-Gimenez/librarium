import "../test-setup";
import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { TypingIndicator } from "./typing-indicator";

describe("TypingIndicator Component", () => {
  it("renders with default label and accessibility attributes", () => {
    render(<TypingIndicator />);

    const statusEl = screen.getByRole("status");
    expect(statusEl).toBeDefined();
    expect(statusEl.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("gerando resposta...")).toBeDefined();
  });

  it("renders with custom label if provided", () => {
    render(<TypingIndicator label="Consultando o acervo..." />);

    expect(screen.getByText("Consultando o acervo...")).toBeDefined();
  });

  it("applies custom className", () => {
    render(<TypingIndicator className="custom-class" />);

    const statusEl = screen.getByRole("status");
    expect(statusEl.className).toContain("custom-class");
  });
});

