import "../test-setup";
import { describe, expect, it } from "bun:test";
import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Header } from "./header";

describe("Header component", () => {
  it("renders the Librarium logo, search bar and AI assistant button with aria-expanded", () => {
    const { rerender } = render(<Header isAssistantOpen={false} />);

    expect(screen.getByText("Librarium")).toBeDefined();
    expect(screen.getByText("Assistente IA")).toBeDefined();

    const assistantButton = screen.getByLabelText(
      "Abrir assistente literário com inteligência artificial",
    );
    expect(assistantButton.getAttribute("aria-expanded")).toBe("false");

    rerender(<Header isAssistantOpen={true} />);
    expect(assistantButton.getAttribute("aria-expanded")).toBe("true");

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );
    expect(input).toBeDefined();
  });

  it("handles input change and invokes onSearchChange callback", () => {
    let capturedValue = "";

    function Wrapper() {
      const [val, setVal] = React.useState("");
      return (
        <Header
          searchValue={val}
          onSearchChange={(nextVal) => {
            setVal(nextVal);
            capturedValue = nextVal;
          }}
        />
      );
    }

    render(<Wrapper />);

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );
    fireEvent.change(input, { target: { value: "Foundation" } });

    expect(capturedValue).toBe("Foundation");
  });

  it("displays clear button when searchValue is provided, clears on click, and refocuses input", () => {
    let cleared = false;

    render(
      <Header
        searchValue="Dune"
        onSearchChange={(val) => {
          if (val === "") cleared = true;
        }}
      />,
    );

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );
    const clearButton = screen.getByLabelText("Limpar busca");
    expect(clearButton).toBeDefined();

    fireEvent.click(clearButton);
    expect(cleared).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("invokes onOpenAssistant when assistant button is clicked", () => {
    let opened = false;

    render(
      <Header
        onOpenAssistant={() => {
          opened = true;
        }}
      />,
    );

    const assistantButton = screen.getByLabelText(
      "Abrir assistente literário com inteligência artificial",
    );
    expect(assistantButton).toBeDefined();

    fireEvent.click(assistantButton);
    expect(opened).toBe(true);
  });

  it("focuses search input and sets defaultPrevented on ⌘K or Ctrl+K", () => {
    render(<Header />);

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );
    expect(document.activeElement).not.toBe(input);

    // Simulate ⌘K
    const metaKeyEvent = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      cancelable: true,
    });
    window.dispatchEvent(metaKeyEvent);

    expect(metaKeyEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);

    // Blur input
    (input as HTMLInputElement).blur();
    expect(document.activeElement).not.toBe(input);

    // Simulate Ctrl+K
    const ctrlKeyEvent = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(ctrlKeyEvent);

    expect(ctrlKeyEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("does not hijack shortcuts when Shift or Alt modifiers are pressed (e.g. Ctrl+Shift+K)", () => {
    render(<Header />);

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );
    (input as HTMLInputElement).blur();

    const devtoolsEvent = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
    });
    window.dispatchEvent(devtoolsEvent);

    expect(devtoolsEvent.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);
  });

  it("handles Escape key: clears text when present and blurs when empty", () => {
    let clearedValue: string | null = null;
    const { rerender } = render(
      <Header
        searchValue="Hyperion"
        onSearchChange={(val) => {
          clearedValue = val;
        }}
      />,
    );

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );
    (input as HTMLInputElement).focus();
    expect(document.activeElement).toBe(input);

    // Escape with search value present should clear the search
    fireEvent.keyDown(window, { key: "Escape" });
    expect(clearedValue).toBe("");

    // Escape with empty search value should blur input
    rerender(<Header searchValue="" />);
    (input as HTMLInputElement).focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).not.toBe(input);
  });

  it("removes global window keydown listener on unmount", () => {
    const { unmount } = render(<Header />);

    const input = screen.getByPlaceholderText(
      "Buscar por título, autor ou palavra-chave...",
    );
    (input as HTMLInputElement).blur();

    unmount();

    // After unmount, dispatching ⌘K should not throw or change active element
    const metaKeyEvent = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      cancelable: true,
    });
    window.dispatchEvent(metaKeyEvent);

    expect(metaKeyEvent.defaultPrevented).toBe(false);
  });
});
