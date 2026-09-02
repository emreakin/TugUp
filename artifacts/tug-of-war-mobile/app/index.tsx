import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EditNameModal } from "@/components/EditNameModal";
import { IconSlot } from "@/components/IconSlot";
import { SubtleBannerSlot } from "@/components/HomeBannerAd";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { FRIENDS_ENABLED } from "@/lib/features";

const MODE_CONFIG = [
  {
    key: "quick" as const,
    labelKey: "home.modes.quickGame" as const,
    hintKey: "home.modes.quickGameHint" as const,
    icon: "flash" as const,
    accent: theme.modes.quick,
    primary: true,
  },
  {
    key: "1v1" as const,
    labelKey: "home.modes.oneVsOne" as const,
    hintKey: "home.modes.oneVsOneHint" as const,
    icon: "people" as const,
    accent: theme.modes.oneVsOne,
    primary: false,
  },
  {
    key: "online" as const,
    labelKey: "home.modes.online" as const,
    hintKey: "home.modes.onlineHint" as const,
    icon: "globe" as const,
    accent: theme.modes.online,
    primary: false,
  },
] as const;

const CHAR_H = 104;
const CHAR_SRC_W = 903;
const CHAR_SRC_H = 713;
const CHAR_W = Math.round((CHAR_SRC_W / CHAR_SRC_H) * CHAR_H);
/** Cropped from the same hand-rope in character_hero.png — 1:1 with sprite scale */
const HAND_ROPE_TILE = require("../assets/images/hand_rope_tile.png");
const HAND_ROPE_SRC_H = 26;
const HAND_ROPE_SRC_W = 38;
const HAND_ROPE_H = (HAND_ROPE_SRC_H / CHAR_SRC_H) * CHAR_H;
const HAND_ROPE_TILE_W = (HAND_ROPE_SRC_W / CHAR_SRC_H) * CHAR_H;
/** Hand-rope center in cropped hero art (abs y 473 → 473-197) */
const HAND_ROPE_CENTER_Y = (473 - 197) / CHAR_SRC_H;
const HAND_ROPE_TOP = CHAR_H * HAND_ROPE_CENTER_Y - HAND_ROPE_H / 2;

const ROPE_OVERLAP = 10;

function HandRopeBridge({ width }: { width: number }) {
  if (width <= 0) return null;
  const span = width + ROPE_OVERLAP * 2;
  const count = Math.max(1, Math.ceil(span / HAND_ROPE_TILE_W) + 1);
  return (
    <View style={[styles.handRopeRow, { width: span, marginLeft: -ROPE_OVERLAP }]}>
      {Array.from({ length: count }, (_, i) => (
        <Image
          key={i}
          source={HAND_ROPE_TILE}
          style={styles.handRopeTile}
          resizeMode="stretch"
        />
      ))}
    </View>
  );
}

function HeroStage() {
  const breathe = useSharedValue(0);
  const [bridgeWidth, setBridgeWidth] = useState(0);

  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [breathe]);

  const leftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: breathe.value * -3 },
      { rotate: `${-breathe.value * 1.2}deg` },
    ],
  }));

  const rightStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: breathe.value * -3 },
      { scaleX: -1 },
      { rotate: `${breathe.value * 1.2}deg` },
    ],
  }));

  const ropeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: breathe.value * -3 }],
  }));

  return (
    <View style={styles.heroStage}>
      <View style={styles.groundGlow} />
      <View style={styles.heroRow}>
        <Animated.Image
          source={require("../assets/images/character_hero.png")}
          style={[styles.heroChar, leftStyle]}
          resizeMode="contain"
        />
        <View
          style={styles.heroBridgeSlot}
          onLayout={(e) => setBridgeWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View style={[styles.handRopeWrap, { top: HAND_ROPE_TOP }, ropeStyle]}>
            <HandRopeBridge width={Math.max(bridgeWidth, 0)} />
          </Animated.View>
        </View>
        <Animated.Image
          source={require("../assets/images/character_hero.png")}
          style={[styles.heroChar, rightStyle]}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const {
    user,
    updateDisplayName,
    coinBalance,
    dailyReward,
    dismissDailyReward,
    refreshCoins,
  } = useAuth();
  const [editNameVisible, setEditNameVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshCoins().catch(() => {});
    }, [refreshCoins]),
  );

  const handlePress = (key: (typeof MODE_CONFIG)[number]["key"]) => {
    if (key === "online") router.push("/online");
    else if (key === "1v1") router.push("/1v1");
    else if (key === "quick") router.push("/quick-game");
  };

  return (
    <View
      style={[
        styles.outerContainer,
        { paddingTop: Platform.OS === "web" ? 8 : insets.top },
      ]}
    >
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[theme.bg, "#101828", theme.bgMid]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["transparent", "rgba(232,93,42,0.08)", "transparent"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.emberWash}
        pointerEvents="none"
      />

      <View style={styles.mainContent}>
        <View style={styles.topBar}>
          <View style={styles.coinBadge}>
            <View style={styles.coinDot}>
              <Text style={styles.coinDotText}>C</Text>
            </View>
            <Text style={styles.coinText}>{coinBalance}</Text>
          </View>
          <LanguageSwitch />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View entering={FadeIn.duration(500)} style={styles.brandBlock}>
            <HeroStage />
            <View style={styles.wordmarkWrap}>
              <Text style={styles.wordmark}>
                <Text style={styles.wordmarkTug}>TUG</Text>
                <Text style={styles.wordmarkUp}>UP</Text>
              </Text>
              <View style={styles.wordmarkUnderline}>
                <HandRopeBridge width={120} />
              </View>
            </View>
            <Text style={styles.tagline}>{t("home.tagline")}</Text>
            <Pressable
              style={styles.nameChip}
              onPress={() => setEditNameVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t("home.tapToEditName")}
            >
              <Text style={styles.nameChipText}>
                {user?.displayName ?? t("common.player")}
              </Text>
              <Ionicons name="pencil" size={12} color={theme.rope} />
            </Pressable>
          </Animated.View>

          <View style={styles.buttonList}>
            {MODE_CONFIG.map((mode, index) => (
              <Animated.View
                key={mode.key}
                entering={FadeInDown.delay(120 + index * 80)
                  .duration(420)
                  .springify()
                  .damping(18)}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.modeButton,
                    mode.primary && styles.modeButtonPrimary,
                    pressed && styles.modeButtonPressed,
                  ]}
                  onPress={() => handlePress(mode.key)}
                >
                  <View
                    style={[
                      styles.modeIconWrap,
                      {
                        backgroundColor: mode.primary
                          ? "rgba(255,255,255,0.16)"
                          : `${mode.accent}22`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={mode.icon}
                      size={20}
                      color={mode.primary ? "#fff" : mode.accent}
                    />
                  </View>
                  <View style={styles.modeCopy}>
                    <Text
                      style={[
                        styles.modeLabel,
                        mode.primary && styles.modeLabelPrimary,
                      ]}
                    >
                      {t(mode.labelKey)}
                    </Text>
                    <Text
                      style={[
                        styles.modeHint,
                        mode.primary && styles.modeHintPrimary,
                      ]}
                    >
                      {t(mode.hintKey)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={mode.primary ? "rgba(255,255,255,0.7)" : theme.textDim}
                  />
                </Pressable>
              </Animated.View>
            ))}
          </View>

          <View style={styles.footer}>
            {FRIENDS_ENABLED ? (
              <Pressable
                style={styles.footerBtn}
                onPress={() => router.push("/friends")}
              >
                <Ionicons name="people-outline" size={16} color={theme.textMuted} />
                <Text style={styles.footerBtnText}>{t("home.friends")}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.footerText}>v0.1.4</Text>
          </View>
        </ScrollView>
      </View>

      <SubtleBannerSlot />

      <EditNameModal
        visible={editNameVisible}
        initialName={user?.displayName ?? ""}
        onClose={() => setEditNameVisible(false)}
        onSave={updateDisplayName}
      />

      <Modal visible={dailyReward != null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <IconSlot
              name="gift-outline"
              size={28}
              color={theme.gold}
              backgroundColor={`${theme.gold}33`}
              style={{ width: 48, height: 48, borderRadius: 24, marginBottom: 12 }}
            />
            <Text style={styles.modalTitle}>{t("home.dailyRewardTitle")}</Text>
            <Text style={styles.modalMessage}>
              {dailyReward
                ? t("home.dailyRewardMessage", {
                    day: dailyReward.streak,
                    reward: dailyReward.reward,
                  })
                : ""}
            </Text>
            <Pressable style={styles.modalBtn} onPress={dismissDailyReward}>
              <Text style={styles.modalBtnText}>{t("home.dailyRewardOk")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  emberWash: {
    ...StyleSheet.absoluteFillObject,
    top: "18%",
    bottom: "28%",
  },
  mainContent: {
    flex: 1,
    minHeight: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    zIndex: 10,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 16,
    alignItems: "center",
    justifyContent: "space-evenly",
    gap: 20,
  },
  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.borderSoft,
  },
  coinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  coinDotText: {
    color: theme.bg,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    lineHeight: 12,
  },
  coinText: {
    color: theme.gold,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  brandBlock: {
    alignItems: "center",
    width: "100%",
    gap: 6,
  },
  heroStage: {
    width: "100%",
    height: CHAR_H + 24,
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 2,
  },
  groundGlow: {
    position: "absolute",
    bottom: 6,
    width: "70%",
    height: 26,
    borderRadius: 999,
    backgroundColor: "rgba(212,160,90,0.12)",
  },
  heroRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    height: CHAR_H + 8,
  },
  heroChar: {
    width: CHAR_W,
    height: CHAR_H,
    zIndex: 2,
  },
  heroBridgeSlot: {
    flex: 1,
    height: CHAR_H,
    zIndex: 1,
    overflow: "visible",
  },
  handRopeWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    height: HAND_ROPE_H,
    overflow: "visible",
  },
  handRopeRow: {
    flexDirection: "row",
    height: HAND_ROPE_H,
  },
  handRopeTile: {
    width: HAND_ROPE_TILE_W,
    height: HAND_ROPE_H,
  },
  wordmarkWrap: {
    alignItems: "center",
    marginTop: 2,
  },
  wordmark: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 68,
    letterSpacing: 3,
    lineHeight: 70,
    textAlign: "center",
    textShadowColor: "rgba(232,93,42,0.45)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 14,
  },
  wordmarkTug: {
    fontFamily: "BebasNeue_400Regular",
    color: theme.text,
  },
  wordmarkUp: {
    fontFamily: "BebasNeue_400Regular",
    color: theme.rope,
  },
  wordmarkUnderline: {
    width: 120,
    height: HAND_ROPE_H,
    marginTop: 2,
    marginBottom: 4,
    overflow: "hidden",
    alignItems: "center",
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: theme.ropeSoft,
    textAlign: "center",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  nameChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    marginTop: 2,
  },
  nameChipText: {
    color: theme.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  buttonList: {
    width: "100%",
    gap: 10,
  },
  modeButton: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modeButtonPrimary: {
    backgroundColor: theme.ember,
    borderColor: theme.emberDeep,
  },
  modeButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  modeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeCopy: {
    flex: 1,
    gap: 2,
  },
  modeLabel: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: theme.text,
    letterSpacing: 0.2,
  },
  modeLabelPrimary: {
    color: "#fff",
  },
  modeHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: theme.textMuted,
  },
  modeHintPrimary: {
    color: "rgba(255,255,255,0.78)",
  },
  footer: {
    alignItems: "center",
    gap: 10,
    paddingTop: 2,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: theme.borderSoft,
  },
  footerBtnText: {
    color: theme.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  footerText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: theme.textDim,
    letterSpacing: 1.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 14, 22, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: theme.surfaceRaised,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalCoin: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalCoinText: {
    color: theme.bg,
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: theme.gold,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.textMuted,
    textAlign: "center",
    marginBottom: 22,
  },
  modalBtn: {
    backgroundColor: theme.gold,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  modalBtnText: {
    color: theme.bg,
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
});
