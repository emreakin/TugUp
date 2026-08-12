import React, { useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getBannerAdUnitId } from "@/native/ad-helper";

type BannerModule = {
  BannerAd: React.ComponentType<{
    unitId: string;
    size: string;
    onAdLoaded?: () => void;
    onAdFailedToLoad?: () => void;
  }>;
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: string };
};

function loadBannerModule(): BannerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ads = require("react-native-google-mobile-ads");
    return {
      BannerAd: ads.BannerAd,
      BannerAdSize: ads.BannerAdSize,
    };
  } catch {
    return null;
  }
}

/**
 * Anchored adaptive banner for idle screens (home, pickers, waiting).
 * Collapsed until loaded; hidden if load fails.
 */
export function SubtleBannerAd() {
  const unitId = getBannerAdUnitId();
  const ads = useMemo(() => loadBannerModule(), []);
  const [visible, setVisible] = useState(false);

  if (!unitId || !ads) return null;

  const { BannerAd, BannerAdSize } = ads;

  return (
    <View style={[styles.wrap, !visible && styles.collapsed]} pointerEvents="box-none">
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setVisible(true)}
        onAdFailedToLoad={() => setVisible(false)}
      />
    </View>
  );
}

/** Bottom-of-screen slot with safe-area padding */
export function SubtleBannerSlot() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.slot,
        { paddingBottom: Platform.OS === "web" ? 0 : Math.max(insets.bottom, 4) },
      ]}
    >
      <SubtleBannerAd />
    </View>
  );
}

/** @deprecated use SubtleBannerAd */
export const HomeBannerAd = SubtleBannerAd;

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    overflow: "hidden",
  },
  collapsed: {
    height: 0,
    opacity: 0,
  },
  slot: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#0f172a",
  },
});
