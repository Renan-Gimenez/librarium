import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "./dialog.js";

describe("Dialog component", () => {
  it("renders trigger and content structure with correct accessibility attributes", () => {
    const html = renderToString(
      <Dialog open={true}>
        <DialogTrigger>Abrir Modal</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Título do Livro</DialogTitle>
            <DialogDescription>Sinopse completa do livro.</DialogDescription>
          </DialogHeader>
          <div>Corpo dos detalhes</div>
          <DialogFooter>
            <button type="button">Ação</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    expect(html).toContain("Abrir Modal");
    expect(html).toContain("Título do Livro");
    expect(html).toContain("Sinopse completa do livro.");
    expect(html).toContain("Corpo dos detalhes");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Fechar");
  });

  it("does not render content when open is false", () => {
    const html = renderToString(
      <Dialog open={false}>
        <DialogTrigger>Abrir Modal</DialogTrigger>
        <DialogContent>
          <DialogTitle>Título Oculto</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(html).toContain("Abrir Modal");
    expect(html).not.toContain("Título Oculto");
  });
});

