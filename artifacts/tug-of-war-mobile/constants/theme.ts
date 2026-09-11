/**
 * TugUp brand tokens — warm iron / rope, not generic slate+Tailwind rainbow.
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
  /** Semantic */
  danger: "#e85d4a",
  dangerSoft: "#e85d4a33",
  success: "#3fa87a",
  warning: "#e0b14a",
  info: "#4a8fd4",
  overlay: "rgba(8,10,14,0.78)",
  white: "#ffffff",
  /** Mode accents */
  modes: {
    quick: "#e85d2a",
    oneVsOne: "#4a8fd4",
    online: "#3fa87a",
  },
  /** In-match arena */
  arena: {
    sky: "#0a0e16",
    mid: "#12131c",
    floor: "#1a1410",
    floorDeep: "#0d0b09",
    dust: "rgba(212,160,90,0.07)",
    spotlight: "rgba(232,196,138,0.16)",
    horizon: "rgba(212,160,90,0.22)",
  },
  /** Loaded font family names (see app/_layout.tsx) */
  fonts: {
    display: "BebasNeue_400Regular",
    regular: "Inter_400Regular",
    semiBold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
  },
} as const;

export type Theme = typeof theme;

/** Typography presets — use with StyleSheet / Text */
export const type = {
  display: {
    fontFamily: theme.fonts.display,
    color: theme.text,
    letterSpacing: 1.5,
  },
  screenTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.text,
    textAlign: "center" as const,
  },
  sectionTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    color: theme.text,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.textMuted,
    lineHeight: 22,
  },
  bodyStrong: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 15,
    color: theme.text,
  },
  caption: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 12,
    color: theme.textDim,
  },
  label: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
  },
  back: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 15,
    color: theme.textMuted,
  },
  button: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.white,
  },
  buttonSecondary: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 15,
    color: theme.textMuted,
  },
} as const;
