import React from "react";
import { StyleProp, TextStyle } from "react-native";

import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { theme } from "@/constants/theme";

export type JokerType = "time" | "bomb" | "turbo";

const JOKER_ICONS: Record<JokerType, AppIconName> = {
  time: "time-outline",
  bomb: "flash-outline",
  turbo: "flash",
};

const JOKER_COLORS: Record<JokerType, string> = {
  time: "#60a5fa",
  bomb: theme.ember,
  turbo: theme.gold,
};

export function JokerIcon({
  type,
  size = 16,
  color,
  style,
}: {
  type: JokerType;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <AppIcon
      name={JOKER_ICONS[type]}
      size={size}
      color={color ?? JOKER_COLORS[type]}
      style={style}
    />
  );
}
