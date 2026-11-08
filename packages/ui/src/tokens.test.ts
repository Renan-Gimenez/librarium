import { describe, expect, it } from "bun:test";
import { tokens } from "./tokens.js";

describe("tokens", () => {
  it("exports valid color tokens matching librarium.pen design system", () => {
    expect(tokens.colors.light.bg).toBe("#FAF8F5");
    expect(tokens.colors.dark.bg).toBe("#0C0D10");
    expect(tokens.colors.light.surface).toBe("#FFFFFF");
    expect(tokens.colors.dark.surface).toBe("#14161B");
    expect(tokens.colors.light.border).toBe("#E4E4E7");
    expect(tokens.colors.dark.border).toBe("#272A34");
    expect(tokens.colors.light.textPrimary).toBe("#18181B");
    expect(tokens.colors.dark.textPrimary).toBe("#F4F4F6");
    expect(tokens.colors.light.textSecondary).toBe("#71717A");
    expect(tokens.colors.dark.textSecondary).toBe("#A1A1AA");
    expect(tokens.colors.accent).toBe("#4F46E5");
    expect(tokens.colors.accentHover).toBe("#4338CA");
    expect(tokens.colors.aiAccent).toBe("#7C3AED");
    expect(tokens.colors.rating).toBe("#F59E0B");
  });

  it("exports valid typography tokens matching librarium.pen", () => {
    expect(tokens.fonts.display).toBe("Newsreader");
    expect(tokens.fonts.ui).toBe("Inter");
    expect(tokens.fonts.mono).toBe("JetBrains Mono");
  });
});

