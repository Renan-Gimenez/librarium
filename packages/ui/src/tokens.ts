export const tokens = {
  colors: {
    light: {
      bg: "#FAF8F5",
      surface: "#FFFFFF",
      surfaceElevated: "#FFFFFF",
      "surface-elevated": "#FFFFFF",
      surfaceMuted: "#F4F2EE",
      "surface-muted": "#F4F2EE",
      border: "#E4E4E7",
      borderStrong: "#D4D4D8",
      "border-strong": "#D4D4D8",
      textPrimary: "#18181B",
      "text-primary": "#18181B",
      textSecondary: "#71717A",
      "text-secondary": "#71717A",
      accentSoft: "#EEF0FE",
      "accent-soft": "#EEF0FE",
      aiSoft: "#F3EEFE",
      "ai-soft": "#F3EEFE",
    },
    dark: {
      bg: "#0C0D10",
      surface: "#14161B",
      surfaceElevated: "#1C1F26",
      "surface-elevated": "#1C1F26",
      surfaceMuted: "#1C1F26",
      "surface-muted": "#1C1F26",
      border: "#272A34",
      borderStrong: "#3A3E4A",
      "border-strong": "#3A3E4A",
      textPrimary: "#F4F4F6",
      "text-primary": "#F4F4F6",
      textSecondary: "#A1A1AA",
      "text-secondary": "#A1A1AA",
      accentSoft: "#23244A",
      "accent-soft": "#23244A",
      aiSoft: "#241C3E",
      "ai-soft": "#241C3E",
    },
    accent: "#4F46E5",
    accentHover: "#4338CA",
    "accent-hover": "#4338CA",
    aiAccent: "#7C3AED",
    "ai-accent": "#7C3AED",
    rating: "#F59E0B",
  },
  fonts: {
    display: "Newsreader",
    ui: "Inter",
    mono: "JetBrains Mono",
  },
} as const;

export type Tokens = typeof tokens;
export type ColorTokens = typeof tokens.colors;
export type FontTokens = typeof tokens.fonts;

