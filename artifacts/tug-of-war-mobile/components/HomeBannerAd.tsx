import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

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
 * Subtle home-screen banner: anchored adaptive size, full-width at the bottom.
 * Collapsed until loaded; fully hidden if load fails (no empty ad chrome).
 */
export function HomeBannerAd() {
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
});
