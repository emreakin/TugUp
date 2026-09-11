import { theme } from "@/constants/theme";

/** Legacy scaffold palette — now mirrors brand theme */
const colors = {
  light: {
    text: theme.text,
    tint: theme.ember,
    background: theme.bg,
    foreground: theme.text,
    card: theme.surface,
    cardForeground: theme.text,
    primary: theme.ember,
    primaryForeground: theme.white,
    secondary: theme.surfaceRaised,
    secondaryForeground: theme.text,
    muted: theme.surface,
    mutedForeground: theme.textMuted,
    accent: theme.surfaceRaised,
    accentForeground: theme.text,
    destructive: theme.danger,
    destructiveForeground: theme.white,
    border: theme.border,
    input: theme.border,
  },
  radius: 16,
};

export default colors;
