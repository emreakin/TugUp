import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleProp, TextStyle } from "react-native";

import { theme } from "@/constants/theme";

export type AppIconName = React.ComponentProps<typeof Ionicons>["name"];

type AppIconProps = {
  name: AppIconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export function AppIcon({
  name,
  size = 20,
  color = theme.text,
  style,
}: AppIconProps) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}

export function CrownIcon({ size = 14, color = theme.gold }: { size?: number; color?: string }) {
  return <AppIcon name="ribbon" size={size} color={color} />;
}

export function TrophyIcon({ size = 48, color = theme.gold }: { size?: number; color?: string }) {
  return <AppIcon name="trophy" size={size} color={color} />;
}
