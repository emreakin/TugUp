import { EditNameModal } from "@/components/EditNameModal";
import { HomeBannerAd } from "@/components/HomeBannerAd";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useAuth } from "@/contexts/AuthContext";
import { FRIENDS_ENABLED } from "@/lib/features";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MODE_CONFIG = [
  {
    key: "quick" as const,
    labelKey: "home.modes.quickGame" as const,
    emoji: "⚡",
    color: "#ef4444",
  },
  {
    key: "1v1" as const,
    labelKey: "home.modes.oneVsOne" as const,
    emoji: "👥",
    color: "#3b82f6",
  },
  {
    key: "online" as const,
    labelKey: "home.modes.online" as const,
    emoji: "🌐",
    color: "#10b981",
  },
] as const;

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

  // Refresh coins when returning to home (uses cached single-flight claim)
  useFocusEffect(
    useCallback(() => {
      refreshCoins().catch(() => {});
    }, [refreshCoins]),
  );

  const handlePress = (key: (typeof MODE_CONFIG)[number]["key"]) => {
    if (key === "online") {
      router.push("/online");
    } else if (key === "1v1") {
      router.push("/1v1");
    } else if (key === "quick") {
      router.push("/quick-game");
    }
  };

  return (
    <View
      style={[
        styles.outerContainer,
        { paddingTop: Platform.OS === "web" ? 8 : insets.top },
      ]}
    >
      <StatusBar barStyle="light-content" />

      <View style={styles.mainContent}>
        <View style={styles.topBar}>
          <View style={styles.coinBadge}>
            <Text style={styles.coinEmoji}>🪙</Text>
            <Text style={styles.coinText}>
              {t("home.coins", { count: coinBalance })}
            </Text>
          </View>
          <LanguageSwitch />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.header}>
            <Image
              source={require("../assets/images/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>{t("home.tagline")}</Text>
            <Pressable
              style={styles.nameChip}
              onPress={() => setEditNameVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t("home.tapToEditName")}
            >
              <Text style={styles.nameChipText}>
                {t("home.yourName", {
                  name: user?.displayName ?? t("common.player"),
                })}
              </Text>
              <Text style={styles.nameChipEdit}>✎</Text>
            </Pressable>
          </View>

          <View style={styles.buttonList}>
            {MODE_CONFIG.map((mode) => (
              <Pressable
                key={mode.key}
                style={({ pressed }) => [
                  styles.modeButton,
                  { backgroundColor: mode.color },
                  pressed && styles.modeButtonPressed,
                ]}
                onPress={() => handlePress(mode.key)}
              >
                <Text style={styles.modeEmoji}>{mode.emoji}</Text>
                <Text style={styles.modeLabel}>{t(mode.labelKey)}</Text>
                <Text style={styles.modeArrow}>›</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.footer}>
            {FRIENDS_ENABLED ? (
              <Pressable style={styles.footerBtn} onPress={() => router.push("/friends")}>
                <Text style={styles.footerBtnText}>👥 {t("home.friends")}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.footerText}>v0.1.3 · TugUp</Text>
          </View>
        </ScrollView>
      </View>

      <View
        style={[
          styles.bannerSlot,
          { paddingBottom: Platform.OS === "web" ? 0 : Math.max(insets.bottom, 4) },
        ]}
      >
        <HomeBannerAd />
      </View>

      <EditNameModal
        visible={editNameVisible}
        initialName={user?.displayName ?? ""}
        onClose={() => setEditNameVisible(false)}
        onSave={updateDisplayName}
      />

      <Modal visible={dailyReward != null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🪙</Text>
            <Text style={styles.modalTitle}>{t("home.dailyRewardTitle")}</Text>
            <Text style={styles.modalMessage}>
              {dailyReward
                ? t("home.dailyRewardMessage", {
                    day: dailyReward.streak,
                    reward: dailyReward.reward,
                  })
                : ""}
            </Text>
            <Pressable
              style={styles.modalBtn}
              onPress={dismissDailyReward}
            >
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
    backgroundColor: "#0f172a",
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
    paddingBottom: 8,
    zIndex: 10,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 16,
    alignItems: "center",
    justifyContent: "space-evenly",
    gap: 16,
  },
  bannerSlot: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#0f172a",
  },
  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1e293b",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  coinEmoji: {
    fontSize: 14,
  },
  coinText: {
    color: "#fbbf24",
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  header: {
    alignItems: "center",
    gap: 8,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 24,
  },
  tagline: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#64748b",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  nameChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1e293b",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  nameChipText: {
    color: "#e2e8f0",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  nameChipEdit: {
    color: "#fbbf24",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  buttonList: {
    width: "100%",
    gap: 12,
  },
  modeButton: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modeButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  modeEmoji: {
    fontSize: 24,
    width: 36,
    textAlign: "center",
  },
  modeLabel: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
  modeArrow: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.6)",
  },
  footer: {
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  footerBtn: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  footerBtnText: {
    color: "#94a3b8",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  footerText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#475569",
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#1e293b",
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  modalEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fbbf24",
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#cbd5e1",
    textAlign: "center",
    marginBottom: 22,
  },
  modalBtn: {
    backgroundColor: "#fbbf24",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  modalBtnText: {
    color: "#0f172a",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
});
