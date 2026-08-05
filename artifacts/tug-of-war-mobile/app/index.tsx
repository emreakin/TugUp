import { EditNameModal } from "@/components/EditNameModal";
import { HomeBannerAd } from "@/components/HomeBannerAd";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useAuth } from "@/contexts/AuthContext";
import { FRIENDS_ENABLED } from "@/lib/features";
import { apiFetch, type CoinBalance, type DailyClaimResult } from "@/lib/api";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
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
    gradient: ["#ef4444", "#dc2626"],
  },
  {
    key: "1v1" as const,
    labelKey: "home.modes.oneVsOne" as const,
    emoji: "👥",
    color: "#3b82f6",
    gradient: ["#3b82f6", "#2563eb"],
  },
  {
    key: "online" as const,
    labelKey: "home.modes.online" as const,
    emoji: "🌐",
    color: "#10b981",
    gradient: ["#10b981", "#059669"],
  },
] as const;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { ensureSession, user, updateDisplayName } = useAuth();
  const [coinBalance, setCoinBalance] = useState(0);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [dailyReward, setDailyReward] = useState<{
    reward: number;
    streak: number;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          const session = await ensureSession();
          const result = await apiFetch<DailyClaimResult>("/api/coins/daily-claim", {
            method: "POST",
            token: session.token,
          });

          // Apply claim even if focus flickered — otherwise Strict Mode drops the reward UI
          setCoinBalance(result.balance);
          if (result.claimed) {
            setDailyReward((prev) => prev ?? { reward: result.reward, streak: result.streak });
          }
        } catch {
          try {
            const session = await ensureSession();
            const wallet = await apiFetch<CoinBalance>("/api/coins", {
              token: session.token,
            });
            if (!cancelled) setCoinBalance(wallet.balance);
          } catch {
            if (!cancelled) setCoinBalance(0);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [ensureSession]),
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

  const topPad = (Platform.OS === "web" ? 16 : insets.top) + 8;

  return (
    <View
      style={[
        styles.outerContainer,
        {
          paddingTop: Platform.OS === "web" ? 0 : insets.top,
        },
      ]}
    >
      <StatusBar barStyle="light-content" />

      <View style={styles.mainContent}>
        <View style={[styles.topBar, { top: topPad }]}>
          <View style={styles.coinBadge}>
            <Text style={styles.coinEmoji}>🪙</Text>
            <Text style={styles.coinText}>
              {t("home.coins", { count: coinBalance })}
            </Text>
          </View>
          <LanguageSwitch />
        </View>

        {/* Logo area */}
        <View style={styles.header}>
          <Image
            source={require("../assets/images/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brand}>TugUp</Text>
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

        {/* Mode buttons */}
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

        {/* Footer */}
        <View style={styles.footer}>
          {FRIENDS_ENABLED ? (
            <Pressable style={styles.footerBtn} onPress={() => router.push("/friends")}>
              <Text style={styles.footerBtnText}>👥 {t("home.friends")}</Text>
            </Pressable>
          ) : null}
          <Text style={styles.footerText}>v0.1.2 · TugUp</Text>
        </View>
      </View>

      {/* Bottom banner — adaptive, non-intrusive; hidden if load fails */}
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
              onPress={() => setDailyReward(null)}
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  bannerSlot: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#0f172a",
  },
  topBar: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    marginTop: 72,
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 32,
    marginBottom: 16,
  },
  brand: {
    fontSize: 48,
    fontFamily: "Inter_700Bold",
    color: "#f8fafc",
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#64748b",
    marginTop: 6,
    textAlign: "center",
  },
  nameChip: {
    marginTop: 14,
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
    gap: 16,
    marginTop: 20,
  },
  modeButton: {
    width: "100%",
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modeButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  modeEmoji: {
    fontSize: 28,
    width: 40,
    textAlign: "center",
  },
  modeLabel: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
  modeArrow: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.6)",
  },
  footer: {
    marginBottom: 12,
    alignItems: "center",
    gap: 12,
  },
  footerBtn: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    paddingVertical: 12,
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
