import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "./sheet.js";

describe("Sheet component", () => {
  it("renders trigger and content structure with correct accessibility attributes", () => {
    const html = renderToString(
      <Sheet open={true}>
        <SheetTrigger>Abrir Assistente</SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Assistente Literário</SheetTitle>
            <SheetDescription>Consultor do acervo · IA</SheetDescription>
          </SheetHeader>
          <div>Conteúdo do Chat</div>
          <SheetFooter>
            <button type="button">Enviar</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );

    expect(html).toContain("Abrir Assistente");
    expect(html).toContain("Assistente Literário");
    expect(html).toContain("Consultor do acervo · IA");
    expect(html).toContain("Conteúdo do Chat");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Fechar");
    expect(html).toContain("slide-in-from-right");
  });

  it("does not render content when open is false", () => {
    const html = renderToString(
      <Sheet open={false}>
        <SheetTrigger>Abrir Assistente</SheetTrigger>
        <SheetContent>
          <SheetTitle>Assistente Oculto</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    expect(html).toContain("Abrir Assistente");
    expect(html).not.toContain("Assistente Oculto");
  });

  it("supports left, top and bottom side variants", () => {
    const htmlLeft = renderToString(
      <Sheet open={true}>
        <SheetContent side="left">
          <SheetTitle>Esquerda</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(htmlLeft).toContain("slide-in-from-left");

    const htmlTop = renderToString(
      <Sheet open={true}>
        <SheetContent side="top">
          <SheetTitle>Topo</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(htmlTop).toContain("slide-in-from-top");

    const htmlBottom = renderToString(
      <Sheet open={true}>
        <SheetContent side="bottom">
          <SheetTitle>Base</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(htmlBottom).toContain("slide-in-from-bottom");
  });
});

