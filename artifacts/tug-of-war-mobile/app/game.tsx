import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
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

import { getApiBase, getApiHeaders } from "@/lib/api";

// AdMob is loaded dynamically on native only — see ad-helper.native.ts

const DEFAULT_MAX_OFFSET = 100;
const STEP = 1;
const CHAR_WIDTH = 100;
const ROPE_PAD = 4;
const WINDOW_WIDTH = Dimensions.get("window").width;

// How far the group must slide so the leading character's center crosses the red line
const MAX_TRANSLATION = WINDOW_WIDTH / 2 - ROPE_PAD - CHAR_WIDTH / 2;

type GameState = "playing" | "left_wins" | "right_wins";

// Returns ms until next Monday 00:00:00 (end of weekly voting period)
function msUntilEndOfWeek(): number {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const daysUntilNextMonday = 7 - daysFromMonday;
  const nextMonday = new Date(now);
  nextMonday.setDate(nextMonday.getDate() + daysUntilNextMonday);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday.getTime() - now.getTime();
}

// "6G 14:23:05" format (G/D = day suffix)
function formatCountdown(ms: number, daySuffix: string): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d}${daySuffix} ${pad(h)}:${pad(m)}:${pad(s)}`;
}

const CHARACTER_IMG = require("@/assets/images/character.png");
const ROPE_IMG = require("@/assets/images/rope.png");

function Character({
  color,
  flipped = false,
  bounceAnim,
}: {
  color: string;
  flipped?: boolean;
  bounceAnim: Animated.Value;
}) {
  return (
    <Animated.View
      style={[styles.charWrap, { transform: [{ translateX: bounceAnim }] }]}
    >
      {/* Soft colored glow behind character */}
      <View
        style={[
          styles.charGlow,
          { backgroundColor: color + "33", shadowColor: color },
        ]}
      />

      {/* Cartoon character image */}
      <Image
        source={CHARACTER_IMG}
        style={[
          styles.charImage,
          flipped && { transform: [{ scaleX: -1 }] },
        ]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

export default function GameScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    matchupId: string;
    left: string;
    right: string;
    leftColor: string;
    rightColor: string;
    emoji: string;
    leftWins: string;
    rightWins: string;
  }>();

  const matchupId = params.matchupId ?? "default";
  const left = params.left ?? t("game.defaultLeft");
  const right = params.right ?? t("game.defaultRight");
  const leftColor = params.leftColor ?? "#ef4444";
  const rightColor = params.rightColor ?? "#3b82f6";
  const emoji = params.emoji ?? "🏆";
  const leftWins = parseInt(params.leftWins ?? "0", 10) || 0;
  const rightWins = parseInt(params.rightWins ?? "0", 10) || 0;
  const leftLeads = leftWins > rightWins;
  const rightLeads = rightWins > leftWins;

  const [offset, setOffset] = useState(0);
  const [gameState, setGameState] = useState<GameState>("playing");
  const [score, setScore] = useState({ left: 0, right: 0 });
  const [clicks, setClicks] = useState({ left: 0, right: 0 });
  const [isLoading, setIsLoading] = useState(true);
  // Remaining seconds until this device can vote again (server-side cooldown)
  const [cooldownSecs, setCooldownSecs] = useState(0);
  // Which side the user last tried to pull (used for ad reward)
  const [pendingSide, setPendingSide] = useState<"left" | "right">("left");
  // True while ad is being loaded/shown
  const [adLoading, setAdLoading] = useState(false);
  // Daily ad rewards used / remaining (max 3 per day)
  const [adRewardsRemaining, setAdRewardsRemaining] = useState(3);
  // Win threshold per matchup (loaded from server, defaults to 100)
  const [maxOffset, setMaxOffset] = useState(DEFAULT_MAX_OFFSET);
  // Per-side shifts: pulled side moves toward puller, puller stays in place
  const leftCharShift = useRef(new Animated.Value(0)).current;
  const rightCharShift = useRef(new Animated.Value(0)).current;
  const leftPulseAnim = useRef(new Animated.Value(1)).current;
  const rightPulseAnim = useRef(new Animated.Value(1)).current;
  const leftCharAnim = useRef(new Animated.Value(0)).current;
  const rightCharAnim = useRef(new Animated.Value(0)).current;

  // Cooldown ticker — counts down cooldownSecs each second
  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const id = setInterval(() => setCooldownSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownSecs]);

  // Restore cooldown from AsyncStorage on mount (survives navigation)
  useEffect(() => {
    AsyncStorage.getItem(`cooldown_end_${matchupId}`).then((stored) => {
      if (!stored) return;
      const endsAt = parseInt(stored, 10);
      const remaining = Math.floor((endsAt - Date.now()) / 1000);
      if (remaining > 0) {
        setCooldownSecs(remaining);
      } else {
        AsyncStorage.removeItem(`cooldown_end_${matchupId}`);
      }
    }).catch(() => {});
  }, [matchupId]);

  // Load daily ad reward limit on mount
  useEffect(() => {
    fetch(`${getApiBase()}/votes/${encodeURIComponent(matchupId)}/reward-limit`, {
      headers: getApiHeaders({}, { json: false }),
    })
      .then((res) => {
        if (!res.ok) return;
        return res.json();
      })
      .then((data: { remaining?: number } | undefined) => {
        if (data?.remaining != null) setAdRewardsRemaining(data.remaining);
      })
      .catch(() => {});
  }, [matchupId]);

  // Animated progress (0 = left fully won, 0.5 = neutral, 1 = right fully won)
  const progressAnim = useRef(new Animated.Value(0.5)).current;

  // Rope width measured from layout — Animated.Value so we can do math on it
  const ropeWrapWidthAnim = useRef(new Animated.Value(WINDOW_WIDTH - 2 * CHAR_WIDTH - 2 * ROPE_PAD)).current;

  useEffect(() => {
    // The LOSER gets dragged toward the center line.
    // offset > 0 → right is winning → left char gets pulled right (toward center)
    // offset < 0 → left is winning → right char gets pulled left (toward center)
    const leftTarget = offset > 0 ? (offset / maxOffset) * MAX_TRANSLATION : 0;
    const rightTarget = offset < 0 ? (offset / maxOffset) * MAX_TRANSLATION : 0;
    Animated.spring(leftCharShift, {
      toValue: leftTarget,
      useNativeDriver: false,
      tension: 80,
      friction: 8,
    }).start();
    Animated.spring(rightCharShift, {
      toValue: rightTarget,
      useNativeDriver: false,
      tension: 80,
      friction: 8,
    }).start();
    // Update the progress bar (offset -MAX → 0, 0 → 0.5, +MAX → 1)
    Animated.spring(progressAnim, {
      toValue: (offset + maxOffset) / (2 * maxOffset),
      useNativeDriver: false,
      tension: 80,
      friction: 10,
    }).start();
  }, [offset]);

  // ropeWidth = wrapWidth - leftCharShift + rightCharShift
  // (rightCharShift is ≤ 0, so adding it shortens from right)
  const ropeWidth = Animated.add(
    Animated.add(ropeWrapWidthAnim, Animated.multiply(leftCharShift, -1)),
    rightCharShift
  );

  // Weekly countdown to next Monday 00:00:00
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(msUntilEndOfWeek(), t("game.countdownDaySuffix")),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(formatCountdown(msUntilEndOfWeek(), t("game.countdownDaySuffix")));
    }, 1000);
    return () => clearInterval(id);
  }, [t]);

  // Load current vote state from server on mount and poll every 15s
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${getApiBase()}/votes/${encodeURIComponent(matchupId)}`, {
          headers: getApiHeaders({}, { json: false }),
        });
        if (!res.ok) return;
        const data: { offset: number; leftPulls: number; rightPulls: number; winThreshold?: number } = await res.json();
        if (cancelled) return;
        const threshold = data.winThreshold ?? DEFAULT_MAX_OFFSET;
        setMaxOffset(threshold);
        const clamped = Math.max(-threshold, Math.min(threshold, data.offset));
        setOffset(clamped);
        setClicks({ left: data.leftPulls, right: data.rightPulls });
        if (clamped <= -threshold) setGameState("left_wins");
        else if (clamped >= threshold) setGameState("right_wins");
        else setGameState("playing");
      } catch {
        // Network error — stay with local state
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    const pollId = setInterval(load, 1_000);
    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [matchupId]);

  const pulseButton = (side: "left" | "right") => {
    const btnAnim = side === "left" ? leftPulseAnim : rightPulseAnim;
    const charAnim = side === "left" ? leftCharAnim : rightCharAnim;
    const charDir = side === "left" ? -5 : 5;

    Animated.sequence([
      Animated.timing(btnAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(btnAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.timing(charAnim, { toValue: charDir, duration: 80, useNativeDriver: true }),
      Animated.spring(charAnim, { toValue: 0, useNativeDriver: true, tension: 200, friction: 8 }),
    ]).start();
  };

  const skipCooldownViaAd = useCallback(
    async (side: "left" | "right") => {
      setAdLoading(true);

      const onComplete = () => {
        setAdLoading(false);
      };

      const clearCooldownOnly = () => {
        fetch(`${getApiBase()}/votes/${encodeURIComponent(matchupId)}/reward`, {
          method: "POST",
          headers: getApiHeaders(),
        })
          .then((res) => {
            if (res.ok) {
              return res.json().then((data: { remaining?: number }) => {
                setCooldownSecs(0);
                AsyncStorage.removeItem(`cooldown_end_${matchupId}`).catch(() => {});
                setPendingSide(side);
                if (data?.remaining != null) setAdRewardsRemaining(data.remaining);
              });
            } else if (res.status === 429) {
              return res.json().then((data: { remaining?: number }) => {
                if (data?.remaining != null) setAdRewardsRemaining(data.remaining);
                Alert.alert(t("game.dailyLimitTitle"), t("game.dailyLimitMessage"));
              });
            }
          })
          .catch(() => {
            Alert.alert(t("common.error"), t("game.connectionError"));
          })
          .finally(onComplete);
      };

      if (Platform.OS !== "web") {
        const { loadRewardedAd } = require("../native/ad-helper");
        try {
          await loadRewardedAd(clearCooldownOnly, () => {
            clearCooldownOnly();
            onComplete();
          });
        } catch {
          onComplete();
        }
      } else {
        // Web preview — skip ad, clear cooldown directly
        clearCooldownOnly();
      }
    },
    [matchupId, t]
  );

  const handlePull = useCallback(
    async (side: "left" | "right") => {
      if (gameState !== "playing") return;

      // If in cooldown, just remember which side and let the ad button handle it
      if (cooldownSecs > 0) {
        setPendingSide(side);
        return;
      }

      pulseButton(side);
      setPendingSide(side);

      try {
        const res = await fetch(
          `${getApiBase()}/votes/${encodeURIComponent(matchupId)}`,
          {
            method: "POST",
            headers: getApiHeaders(),
            body: JSON.stringify({ side }),
          }
        );
        if (!res.ok) return;
        const data: {
          offset: number;
          leftPulls: number;
          rightPulls: number;
          accepted: boolean;
          cooldownSeconds: number | null;
          winThreshold?: number;
        } = await res.json();

        // Always sync pull counts from server
        setClicks({ left: data.leftPulls, right: data.rightPulls });

        if (!data.accepted && data.cooldownSeconds != null) {
          setCooldownSecs(data.cooldownSeconds);
          const endsAt = Date.now() + data.cooldownSeconds * 1000;
          AsyncStorage.setItem(`cooldown_end_${matchupId}`, String(endsAt)).catch(() => {});
          return;
        }

        const threshold = data.winThreshold ?? DEFAULT_MAX_OFFSET;
        setMaxOffset(threshold);
        const clamped = Math.max(-threshold, Math.min(threshold, data.offset));
        setOffset(clamped);
        if (clamped <= -threshold) {
          setGameState("left_wins");
          setScore((s) => ({ ...s, left: s.left + 1 }));
        } else if (clamped >= threshold) {
          setGameState("right_wins");
          setScore((s) => ({ ...s, right: s.right + 1 }));
        }
        // Start cooldown immediately so the buttons go inactive right after first pull
        const cooldownDuration = 3_600;
        setCooldownSecs(cooldownDuration);
        const endsAt = Date.now() + cooldownDuration * 1000;
        AsyncStorage.setItem(`cooldown_end_${matchupId}`, String(endsAt)).catch(() => {});
      } catch {
        // Network error — silently ignore
      }
    },
    [gameState, cooldownSecs, matchupId, t]
  );

  const resetGame = () => {
    setOffset(0);
    setGameState("playing");
    setClicks({ left: 0, right: 0 });
    leftCharShift.setValue(0);
    rightCharShift.setValue(0);
    leftCharAnim.setValue(0);
    rightCharAnim.setValue(0);
  };

  const winner = gameState === "left_wins" ? left : right;
  const winnerColor = gameState === "left_wins" ? leftColor : rightColor;

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← {t("common.mainMenu")}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{emoji}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Team labels */}
      <View style={styles.teamRow}>
        <Text style={[styles.teamLabel, { color: leftColor }]} numberOfLines={1}>
          {leftLeads ? "👑 " : ""}{left}
        </Text>
        <Text style={styles.vsLabel}>{t("common.vs")}</Text>
        <Text style={[styles.teamLabel, { color: rightColor }]} numberOfLines={1}>
          {right}{rightLeads ? " 👑" : ""}
        </Text>
      </View>

      {/* Click counts */}
      <View style={styles.clickRow}>
        <Text style={[styles.clickCount, { color: leftColor }]}>{clicks.left}</Text>
        <Text style={[styles.clickCount, { color: rightColor }]}>{clicks.right}</Text>
      </View>

      {/* Rope area with characters on each side */}
      <View style={styles.ropeArea}>
        {/* Left character (slides right when right side pulls) */}
        <Animated.View
          style={[
            styles.charSlot,
            { transform: [{ translateX: leftCharShift }] },
          ]}
        >
          <Character color={leftColor} bounceAnim={leftCharAnim} />
        </Animated.View>

        {/* Rope between hands - tracks both characters */}
        <View
          style={styles.ropeWrap}
          onLayout={(e) => ropeWrapWidthAnim.setValue(e.nativeEvent.layout.width)}
        >
          <Animated.View
            style={[styles.ropeImgWrap, { left: leftCharShift, width: ropeWidth }]}
          >
            <Image
              source={ROPE_IMG}
              resizeMode="stretch"
              style={styles.ropeImg}
            />
          </Animated.View>
        </View>

        {/* Right character (slides left when left side pulls) */}
        <Animated.View
          style={[
            styles.charSlot,
            { transform: [{ translateX: rightCharShift }] },
          ]}
        >
          <Character color={rightColor} flipped bounceAnim={rightCharAnim} />
        </Animated.View>

        {/* Fixed center line */}
        <View style={styles.centerLine} pointerEvents="none" />

        {/* Weekly countdown to next reset */}
        <View style={styles.countdownWrap} pointerEvents="none">
          <Text style={styles.countdownLabel}>{t("game.timeRemaining")}</Text>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>

        {/* Progress bar — pulls remaining to win for each side */}
        <View style={styles.progressWrap} pointerEvents="none">
          <View style={styles.progressCard}>
            <View style={[styles.progressBadge, { backgroundColor: leftColor + "22", borderColor: leftColor }]}>
              <Text style={[styles.progressBadgeNum, { color: leftColor }]}>
                {Math.max(0, maxOffset + offset)}
              </Text>
              <Text style={[styles.progressBadgeLabel, { color: leftColor }]}>{t("game.remaining")}</Text>
            </View>

            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFillLeft,
                  {
                    backgroundColor: leftColor,
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["100%", "0%"],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.progressFillRight,
                  {
                    backgroundColor: rightColor,
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.progressMarker,
                  {
                    left: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              />
            </View>

            <View style={[styles.progressBadge, { backgroundColor: rightColor + "22", borderColor: rightColor }]}>
              <Text style={[styles.progressBadgeNum, { color: rightColor }]}>
                {Math.max(0, maxOffset - offset)}
              </Text>
              <Text style={[styles.progressBadgeLabel, { color: rightColor }]}>{t("game.remaining")}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Pull buttons */}
      <View style={{ paddingBottom: bottomInset + 16 }}>
        <View style={styles.buttonsRow}>
          <Animated.View style={[styles.buttonWrap, { transform: [{ scale: leftPulseAnim }] }]}>
            <Pressable
              style={[
                styles.pullBtn,
                { backgroundColor: leftColor + "22", borderColor: leftColor },
                (gameState !== "playing" || isLoading) && styles.pullBtnDisabled,
                cooldownSecs > 0 && styles.pullBtnCooldown,
              ]}
              onPress={() => handlePull("left")}
              disabled={gameState !== "playing" || isLoading}
            >
              <Text style={[styles.pullBtnText, { color: leftColor }]}>
                {cooldownSecs > 0
                  ? `⏳ ${Math.floor(cooldownSecs / 60)}:${String(cooldownSecs % 60).padStart(2, "0")}`
                  : t("game.pullLeft")}
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View style={[styles.buttonWrap, { transform: [{ scale: rightPulseAnim }] }]}>
            <Pressable
              style={[
                styles.pullBtn,
                { backgroundColor: rightColor + "22", borderColor: rightColor },
                (gameState !== "playing" || isLoading) && styles.pullBtnDisabled,
                cooldownSecs > 0 && styles.pullBtnCooldown,
              ]}
              onPress={() => handlePull("right")}
              disabled={gameState !== "playing" || isLoading}
            >
              <Text style={[styles.pullBtnText, { color: rightColor }]}>
                {cooldownSecs > 0
                  ? `${Math.floor(cooldownSecs / 60)}:${String(cooldownSecs % 60).padStart(2, "0")} ⏳`
                  : t("game.pullRight")}
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        {/* Ad button — visible only during cooldown and if daily rewards remain */}
        {cooldownSecs > 0 && gameState === "playing" && adRewardsRemaining > 0 && (
          <Pressable
            style={[
              styles.adBtn,
              adLoading && styles.adBtnLoading,
            ]}
            onPress={() => skipCooldownViaAd(pendingSide)}
            disabled={adLoading}
          >
            <Text style={styles.adBtnText}>
              {adLoading ? t("game.adLoading") : t("game.watchAd", { remaining: adRewardsRemaining })}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Win modal */}
      <Modal visible={gameState !== "playing"} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { borderColor: winnerColor }]}>
            <Text style={styles.modalTrophy}>🏆</Text>
            <Text style={[styles.modalWinner, { color: winnerColor }]}>{winner}</Text>
            <Text style={styles.modalKazandi}>{t("game.won")}</Text>
            <Text style={styles.modalConfetti}>
              {gameState === "left_wins" ? "🎉" : "🎊"}
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={resetGame}
              >
                <Text style={styles.modalBtnText}>{t("game.playAgain")}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={() => router.back()}
              >
                <Text style={styles.modalBtnTextSecondary}>{t("game.menu")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 10,
  },
  backText: {
    color: "#94a3b8",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  headerTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    flex: 1,
    textAlign: "center",
  },
  headerEmoji: {
    flex: 1,
    textAlign: "center",
    fontSize: 24,
  },
  headerSpacer: {
    width: 60,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 8,
  },
  teamLabel: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    flex: 1,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  vsLabel: {
    color: "#475569",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginHorizontal: 10,
  },
  clickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    marginTop: 6,
    marginBottom: 4,
  },
  clickCount: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },

  /* Rope area */
  ropeArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ROPE_PAD,
    position: "relative",
  },
  charSlot: {
    width: CHAR_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  ropeWrap: {
    flex: 1,
    height: 140,
    overflow: "hidden",
  },
  ropeImgWrap: {
    position: "absolute",
    top: 64,
    height: 4,
  },
  ropeImg: {
    width: "100%",
    height: 4,
  },
  centerLine: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 5,
    height: 90,
    backgroundColor: "#ef4444",
    borderRadius: 2.5,
    marginLeft: -2.5,
    marginTop: -45,
    shadowColor: "#ef4444",
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  countdownWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: "50%",
    alignItems: "center",
    justifyContent: "center",
  },
  countdownLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#ef4444",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginBottom: 4,
    opacity: 0.9,
  },
  countdownText: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: "#f8fafc",
    letterSpacing: 3,
    textShadowColor: "rgba(239, 68, 68, 0.8)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },

  /* Progress bar (pulls remaining) */
  progressWrap: {
    position: "absolute",
    top: "50%",
    marginTop: 110,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  progressBadge: {
    minWidth: 56,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
  },
  progressBadgeNum: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    lineHeight: 24,
  },
  progressBadgeLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
    opacity: 0.9,
  },
  progressTrack: {
    flex: 1,
    height: 10,
    backgroundColor: "rgba(148, 163, 184, 0.15)",
    borderRadius: 5,
    overflow: "visible",
    position: "relative",
  },
  progressFillLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 5,
    opacity: 0.85,
  },
  progressFillRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    borderRadius: 5,
    opacity: 0.85,
  },
  progressMarker: {
    position: "absolute",
    top: -4,
    width: 4,
    height: 18,
    marginLeft: -2,
    backgroundColor: "#f8fafc",
    borderRadius: 2,
    shadowColor: "#fff",
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },

  /* Character */
  charWrap: {
    width: 100,
    height: 140,
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
  },
  charGlow: {
    position: "absolute",
    width: 86,
    height: 32,
    borderRadius: 43,
    bottom: 4,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
    opacity: 0.85,
  },
  charImage: {
    width: 110,
    height: 140,
  },

  /* Buttons */
  buttonsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
    paddingTop: 16,
  },
  buttonWrap: {
    flex: 1,
  },
  pullBtn: {
    borderRadius: 20,
    borderWidth: 2,
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pullBtnText: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  pullBtnDisabled: {
    opacity: 0.5,
  },
  pullBtnCooldown: {
    opacity: 0.6,
  },
  adBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 191, 36, 0.15)",
    borderWidth: 1.5,
    borderColor: "rgba(251, 191, 36, 0.6)",
  },
  adBtnLoading: {
    opacity: 0.6,
  },
  adBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fbbf24",
    letterSpacing: 0.5,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalBox: {
    backgroundColor: "#1e293b",
    borderRadius: 28,
    padding: 36,
    alignItems: "center",
    borderWidth: 2,
    width: "100%",
    maxWidth: 340,
    gap: 8,
  },
  modalTrophy: {
    fontSize: 56,
    marginBottom: 4,
  },
  modalWinner: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  modalKazandi: {
    fontSize: 18,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_600SemiBold",
  },
  modalConfetti: {
    fontSize: 40,
    marginVertical: 4,
  },
  modalButtons: {
    width: "100%",
    gap: 10,
    marginTop: 8,
  },
  modalBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalBtnPrimary: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  modalBtnSecondary: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  modalBtnText: {
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  modalBtnTextSecondary: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
