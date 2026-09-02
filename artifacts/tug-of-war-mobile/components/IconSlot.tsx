import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { theme } from "@/constants/theme";

type IconSlotProps = {
  name: AppIconName;
  size?: number;
  color?: string;
  backgroundColor?: string;
  style?: ViewStyle;
};

/** Fixed-width icon container for list rows / mode cards */
export function IconSlot({
  name,
  size = 22,
  color = theme.text,
  backgroundColor = `${theme.text}14`,
  style,
}: IconSlotProps) {
  return (
    <View style={[styles.wrap, { backgroundColor }, style]}>
      <AppIcon name={name} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
