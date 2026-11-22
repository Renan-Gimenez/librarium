import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  Button,
  buttonVariants,
  Input,
  Textarea,
  SearchBar,
  SearchBarIcon,
  SearchBarInput,
  SearchBarShortcut,
  Badge,
  badgeVariants,
} from "./index.js";

type ForwardRefElement = {
  ref?: unknown;
  props: { ref?: unknown; [key: string]: unknown };
};

const getElementRef = (el: ForwardRefElement) => el.props.ref ?? el.ref;

describe("Button component", () => {
  it("renders with default variant (primary) and default size (md)", () => {
    const html = renderToString(<Button>Clique aqui</Button>);
    expect(html).toContain("Clique aqui");
    expect(html).toContain("bg-[#4F46E5]");
    expect(html).toContain("text-white");
    expect(html).toContain("rounded-[10px]");
    expect(html).toContain("px-[18px]");
    expect(html).toContain("py-[10px]");
    expect(html).toContain("text-[14px]");
  });

  it("applies all variants correctly", () => {
    const primary = renderToString(<Button variant="primary">Primary</Button>);
    expect(primary).toContain("bg-[#4F46E5]");
    expect(primary).toContain("hover:bg-[#4338CA]");

    const secondary = renderToString(
      <Button variant="secondary">Secondary</Button>
    );
    expect(secondary).toContain("border-[#E4E4E7]");
    expect(secondary).toContain("dark:border-[#272A34]");
    expect(secondary).toContain("text-[#18181B]");

    const outline = renderToString(<Button variant="outline">Outline</Button>);
    expect(outline).toContain("border-[#D4D4D8]");
    expect(outline).toContain("dark:border-[#3A3E4A]");

    const ghost = renderToString(<Button variant="ghost">Ghost</Button>);
    expect(ghost).toContain("bg-[#EEF0FE]");
    expect(ghost).toContain("text-[#4F46E5]");

    const ai = renderToString(<Button variant="ai">AI</Button>);
    expect(ai).toContain("bg-[#7C3AED]");
    expect(ai).toContain("text-white");
  });

  it("applies all sizes correctly", () => {
    const sm = renderToString(<Button size="sm">Small</Button>);
    expect(sm).toContain("px-[12px]");
    expect(sm).toContain("py-[6px]");
    expect(sm).toContain("text-[13px]");

    const md = renderToString(<Button size="md">Medium</Button>);
    expect(md).toContain("px-[18px]");
    expect(md).toContain("py-[10px]");
    expect(md).toContain("text-[14px]");

    const lg = renderToString(<Button size="lg">Large</Button>);
    expect(lg).toContain("px-[22px]");
    expect(lg).toContain("py-[12px]");
    expect(lg).toContain("text-[15px]");

    const icon = renderToString(
      <Button size="icon" aria-label="Adicionar">
        +
      </Button>
    );
    expect(icon).toContain("h-[38px]");
    expect(icon).toContain("w-[38px]");
    expect(icon).toContain('aria-label="Adicionar"');
  });

  it("renders variant='ai' size='lg' matching spec I/O matrix", () => {
    const html = renderToString(
      <Button variant="ai" size="lg">
        IA
      </Button>
    );
    expect(html).toContain("bg-[#7C3AED]");
    expect(html).toContain("px-[22px]");
    expect(html).toContain("py-[12px]");
    expect(html).toContain("text-[15px]");
  });

  it("handles disabled button state", () => {
    const html = renderToString(<Button disabled>Salvar</Button>);
    expect(html).toContain("disabled");
    expect(html).toContain("disabled:opacity-[0.45]");
    expect(html).toContain("disabled:pointer-events-none");
  });

  it("forwards ref to button element", () => {
    const ref = React.createRef<HTMLButtonElement>();
    const element = (Button as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({ children: "Ref Test" }, ref);
    expect(getElementRef(element)).toBe(ref);
  });

  it("merges custom className with buttonVariants", () => {
    const html = renderToString(
      <Button className="custom-button-class">Custom</Button>
    );
    expect(html).toContain("custom-button-class");
    expect(html).toContain("bg-[#4F46E5]");
  });

  it("exposes buttonVariants helper directly", () => {
    const classes = buttonVariants({ variant: "ghost", size: "sm" });
    expect(classes).toContain("bg-[#EEF0FE]");
    expect(classes).toContain("text-[13px]");
  });
});

describe("Input and Textarea components", () => {
  it("renders Input with default attributes and design tokens", () => {
    const html = renderToString(
      <Input placeholder="Buscar por título..." defaultValue="Douglas Adams" />
    );
    expect(html).toContain('type="text"');
    expect(html).toContain('placeholder="Buscar por título..."');
    expect(html).toContain('value="Douglas Adams"');
    expect(html).toContain("h-[42px]");
    expect(html).toContain("rounded-[10px]");
    expect(html).toContain("border-[#E4E4E7]");
    expect(html).toContain("dark:border-[#272A34]");
    expect(html).toContain("focus-visible:border-[#4F46E5]");
    expect(html).toContain("focus-visible:ring-[#4F46E5]");
    expect(html).toContain("px-[14px]");
    expect(html).toContain("text-[14px]");
  });

  it("renders Input with disabled state", () => {
    const html = renderToString(<Input disabled placeholder="Desabilitado" />);
    expect(html).toContain("disabled");
    expect(html).toContain("disabled:opacity-[0.45]");
    expect(html).toContain("disabled:cursor-not-allowed");
  });

  it("forwards ref to input element", () => {
    const ref = React.createRef<HTMLInputElement>();
    const element = (Input as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({}, ref);
    expect(getElementRef(element)).toBe(ref);
  });

  it("renders Textarea with design tokens", () => {
    const html = renderToString(
      <Textarea placeholder="Sinopse do livro..." rows={4} />
    );
    expect(html).toContain('placeholder="Sinopse do livro..."');
    expect(html).toContain("min-h-[96px]");
    expect(html).toContain("rounded-[10px]");
    expect(html).toContain("border-[#E4E4E7]");
    expect(html).toContain("dark:border-[#272A34]");
    expect(html).toContain("focus-visible:border-[#4F46E5]");
    expect(html).toContain("p-[12px]");
    expect(html).toContain("text-[13px]");
  });

  it("forwards ref to textarea element", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    const element = (Textarea as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({}, ref);
    expect(getElementRef(element)).toBe(ref);
  });
});

describe("SearchBar compound component", () => {
  it("renders full compound SearchBar matching .pen specification", () => {
    const html = renderToString(
      <SearchBar>
        <SearchBar.Icon>
          <span className="search-icon">🔍</span>
        </SearchBar.Icon>
        <SearchBar.Input placeholder="Buscar por título, autor ou tema..." />
        <SearchBar.Shortcut>⌘K</SearchBar.Shortcut>
      </SearchBar>
    );

    // Root container
    expect(html).toContain("h-[42px]");
    expect(html).toContain("rounded-[10px]");
    expect(html).toContain("border-[#E4E4E7]");
    expect(html).toContain("dark:border-[#272A34]");
    expect(html).toContain("px-[14px]");
    expect(html).toContain("gap-[10px]");

    // Subcomponents
    expect(html).toContain("search-icon");
    expect(html).toContain('placeholder="Buscar por título, autor ou tema..."');
    expect(html).toContain("<kbd");
    expect(html).toContain("⌘K");
    expect(html).toContain("rounded-[6px]");
    expect(html).toContain("font-mono");
    expect(html).toContain("text-[11px]");
  });

  it("allows importing subcomponents individually", () => {
    const html = renderToString(
      <SearchBar>
        <SearchBarIcon>icon</SearchBarIcon>
        <SearchBarInput placeholder="Buscar..." />
        <SearchBarShortcut>Ctrl+K</SearchBarShortcut>
      </SearchBar>
    );
    expect(html).toContain("icon");
    expect(html).toContain("Ctrl+K");
  });

  it("forwards refs to all SearchBar subcomponents", () => {
    const rootRef = React.createRef<HTMLDivElement>();
    const rootEl = (SearchBarRootComponent as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({}, rootRef);
    expect(getElementRef(rootEl)).toBe(rootRef);

    const inputRef = React.createRef<HTMLInputElement>();
    const inputEl = (SearchBarInput as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({}, inputRef);
    expect(getElementRef(inputEl)).toBe(inputRef);

    const iconRef = React.createRef<HTMLSpanElement>();
    const iconEl = (SearchBarIcon as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({}, iconRef);
    expect(getElementRef(iconEl)).toBe(iconRef);

    const shortcutRef = React.createRef<HTMLElement>();
    const shortcutEl = (SearchBarShortcut as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({}, shortcutRef);
    expect(getElementRef(shortcutEl)).toBe(shortcutRef);
  });
});

const SearchBarRootComponent = SearchBar;

describe("Badge component", () => {
  it("renders with default variant", () => {
    const html = renderToString(<Badge>Novidade</Badge>);
    expect(html).toContain("Novidade");
    expect(html).toContain("bg-[#4F46E5]");
    expect(html).toContain("text-white");
    expect(html).toContain("rounded-[6px]");
    expect(html).toContain("text-[10px]");
  });

  it("renders variant='ai' matching spec I/O matrix", () => {
    const html = renderToString(<Badge variant="ai">IA</Badge>);
    expect(html).toContain("<span");
    expect(html).toContain("IA");
    expect(html).toContain("bg-[#F3EEFE]");
    expect(html).toContain("dark:bg-[#241C3E]");
    expect(html).toContain("text-[#7C3AED]");
    expect(html).toContain("font-semibold");
    expect(html).toContain("rounded-[6px]");
  });

  it("renders variant='genre' matching design tokens", () => {
    const html = renderToString(<Badge variant="genre">SCIENCE</Badge>);
    expect(html).toContain("SCIENCE");
    expect(html).toContain("bg-[#EEF0FE]");
    expect(html).toContain("dark:bg-[#23244A]");
    expect(html).toContain("text-[#4F46E5]");
    expect(html).toContain("uppercase");
    expect(html).toContain("tracking-[0.6px]");
  });

  it("renders variant='secondary' and 'outline'", () => {
    const secondary = renderToString(
      <Badge variant="secondary">Secundário</Badge>
    );
    expect(secondary).toContain("bg-[#F4F2EE]");
    expect(secondary).toContain("dark:bg-[#1C1F26]");

    const outline = renderToString(<Badge variant="outline">Contorno</Badge>);
    expect(outline).toContain("border-[#E4E4E7]");
    expect(outline).toContain("dark:border-[#272A34]");
  });

  it("forwards ref to span element", () => {
    const ref = React.createRef<HTMLSpanElement>();
    const element = (Badge as unknown as {
      render: (props: unknown, ref: unknown) => ForwardRefElement;
    }).render({ children: "Badge Ref" }, ref);
    expect(getElementRef(element)).toBe(ref);
  });

  it("merges custom className and exports badgeVariants", () => {
    const html = renderToString(
      <Badge className="custom-badge">Teste</Badge>
    );
    expect(html).toContain("custom-badge");
    const classes = badgeVariants({ variant: "genre" });
    expect(classes).toContain("uppercase");
  });
});
