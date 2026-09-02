/**
 * TugUp brand tokens — warm iron / rope, not generic slate+Tailwind rainbow.
 * Use these on polished surfaces; migrate screens over time.
 */
export const theme = {
  bg: "#0a0e16",
  bgMid: "#121826",
  surface: "#171e2b",
  surfaceRaised: "#1e2738",
  border: "#2c3648",
  borderSoft: "#243044",
  text: "#f2ebe3",
  textMuted: "#8b95a8",
  textDim: "#5c6678",
  /** Rope / metal warmth */
  rope: "#d4a05a",
  ropeSoft: "#e8c48a",
  /** Primary action / pull energy */
  ember: "#e85d2a",
  emberDeep: "#b8431c",
  /** Coin / reward */
  gold: "#e0b14a",
  /** Mode accents (tonal, not full-button fills) */
  modes: {
    quick: "#e85d2a",
    oneVsOne: "#4a8fd4",
    online: "#3fa87a",
  },
} as const;

export type Theme = typeof theme;
