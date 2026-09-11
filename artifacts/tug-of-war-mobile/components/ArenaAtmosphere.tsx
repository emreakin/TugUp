import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, ImageSourcePropType, StyleSheet, View } from "react-native";

import { theme } from "@/constants/theme";

type ArenaAtmosphereProps = {
  /** Full-bleed stage art (Mortal Kombat-style environment) */
  stageImage?: ImageSourcePropType | null;
  /** Soft side wash behind left fighter (only when no stage image) */
  leftColor?: string;
  /** Soft side wash behind right fighter (only when no stage image) */
  rightColor?: string;
};

/**
 * Match backdrop. Prefer a stage photo/illustration; otherwise a quiet dark fill
 * so the rope lane never looks like empty flat slate.
 */
export function ArenaAtmosphere({
  stageImage,
  leftColor,
  rightColor,
}: ArenaAtmosphereProps) {
  if (stageImage) {
    return (
      <View pointerEvents="none" style={styles.root}>
        <Image source={stageImage} style={styles.stageImage} resizeMode="cover" />
        {/* Keep fighters + HUD readable without killing the scene */}
        <LinearGradient
          colors={["rgba(8,10,14,0.42)", "rgba(8,10,14,0.12)", "rgba(8,10,14,0.55)"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["rgba(8,10,14,0.35)", "transparent"]}
          style={styles.topVignette}
        />
        <LinearGradient
          colors={["transparent", "rgba(8,10,14,0.45)"]}
          style={styles.bottomVignette}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={styles.root}>
      <LinearGradient
        colors={[theme.arena.sky, theme.arena.mid, theme.arena.floorDeep]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      {leftColor ? (
        <LinearGradient
          colors={[`${leftColor}28`, "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.washLeft}
        />
      ) : null}
      {rightColor ? (
        <LinearGradient
          colors={["transparent", `${rightColor}28`]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.washRight}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    zIndex: 0,
  },
  stageImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  washLeft: {
    position: "absolute",
    left: 0,
    top: "12%",
    bottom: "18%",
    width: "36%",
  },
  washRight: {
    position: "absolute",
    right: 0,
    top: "12%",
    bottom: "18%",
    width: "36%",
  },
  topVignette: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "20%",
  },
  bottomVignette: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "22%",
  },
});
