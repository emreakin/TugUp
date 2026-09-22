import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArenaAtmosphere } from "@/components/ArenaAtmosphere";
import { AppIcon } from "@/components/AppIcon";
import { theme, type } from "@/constants/theme";
import {
  fetchMatchupBattleState,
  type BattleSide,
  type MatchupBattleState,
} from "@/lib/api";
import {
  CHALLENGE_PLACEHOLDER_NAMES,
  ONLINE_CHALLENGES,
  type OnlineChallengeType,
} from "@/lib/onlineChallenges";

const { width: WINDOW_WIDTH } = Dimensions.get("window");
const POLL_MS = 4_000;
const ROPE_MAX_SHIFT = WINDOW_WIDTH * 0.18;

function formatPoints(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale.startsWith("tr") ? "tr-TR" : "en-US").format(
      Math.max(0, Math.floor(n)),
    );
  } catch {
    return String(Math.max(0, Math.floor(n)));
  }
}

function formatCountdown(ms: number, daySuffix: string): string {
  const clamped = Math.max(0, ms);
  const totalSec = Math.floor(clamped / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  if (d > 0) return `${d}${daySuffix} ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function OnlineBattleScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{
    matchupId?: string;
    left?: string;
    right?: string;
    leftColor?: string;
    rightColor?: string;
    emoji?: string;
    side?: string;
  }>();

  const matchupId = params.matchupId ?? "";
  const leftName = params.left || t("game.defaultLeft");
  const rightName = params.right || t("game.defaultRight");
  const leftColor = params.leftColor || "#ef4444";
  const rightColor = params.rightColor || "#3b82f6";

  const initialSide: BattleSide | null =
    params.side === "left" || params.side === "right" ? params.side : null;

  const [selectedSide, setSelectedSide] = useState<BattleSide | null>(initialSide);
  const [state, setState] = useState<MatchupBattleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);
  const [countdownMs, setCountdownMs] = useState(0);

  const ropeAnim = useRef(new Animated.Value(0)).current;
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const hasStateRef = useRef(false);

  const loadState = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!matchupId || inFlight.current) return;
      inFlight.current = true;
      if (!silent) {
        setError(false);
      }
      try {
        const next = await fetchMatchupBattleState(matchupId, {
          onWaking: () => {
            if (mounted.current) setWakingUp(true);
          },
        });
        if (!mounted.current) return;
        hasStateRef.current = true;
        setState(next);
        setError(false);
        const ends = new Date(next.weekEndsAt).getTime();
        if (Number.isFinite(ends)) {
          setCountdownMs(Math.max(0, ends - Date.now()));
        }
      } catch {
        if (!mounted.current) return;
        if (!hasStateRef.current) setError(true);
      } finally {
        if (mounted.current) {
          setLoading(false);
          setWakingUp(false);
        }
        inFlight.current = false;
      }
    },
    [matchupId],
  );

  // Initial + interval refresh
  useEffect(() => {
    mounted.current = true;
    if (!matchupId) {
      setLoading(false);
      setError(true);
      return;
    }
    loadState();
    const pollId = setInterval(() => loadState({ silent: true }), POLL_MS);
    const appSub = AppState.addEventListener("change", (next) => {
      if (next === "active") loadState({ silent: true });
    });
    return () => {
      mounted.current = false;
      clearInterval(pollId);
      appSub.remove();
    };
  }, [matchupId, loadState]);

  // Countdown ticker from server weekEndsAt
  useEffect(() => {
    if (!state?.weekEndsAt) return;
    const tick = () => {
      const ends = new Date(state.weekEndsAt).getTime();
      setCountdownMs(Math.max(0, ends - Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state?.weekEndsAt]);

  // Rope follows left percentage (50 = center). Clamped for readability.
  useEffect(() => {
    if (!state) return;
    // Positive shift = rope pulled toward left (left leading)
    const bias = (state.leftPercentage - 50) / 50; // -1 … +1
    const target = Math.max(-ROPE_MAX_SHIFT, Math.min(ROPE_MAX_SHIFT, bias * ROPE_MAX_SHIFT));
    Animated.spring(ropeAnim, {
      toValue: target,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, [state, ropeAnim]);

  const onChallengePress = (type: OnlineChallengeType) => {
    if (!selectedSide) {
      Alert.alert(t("game.pickSideTitle"), t("game.pickSideMessage"));
      return;
    }
    Alert.alert(CHALLENGE_PLACEHOLDER_NAMES[type]);
  };

  const locale = i18n.language || "en";
  const leftPts = state?.leftPoints ?? null;
  const rightPts = state?.rightPoints ?? null;
  const leftPct = state?.leftPercentage ?? null;
  const rightPct = state?.rightPercentage ?? null;
  const totalPts = state?.totalPoints ?? null;

  const leaderLabel = (() => {
    if (!state) return null;
    if (state.isDraw || !state.leaderSide) return t("game.tied");
    const name = state.leaderSide === "left" ? leftName : rightName;
    return t("game.leading", { team: name });
  })();

  if (!matchupId) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.errorTitle}>{t("game.loadFailedTitle")}</Text>
        <Pressable style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryBtnText}>{t("common.back")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
        >
          <AppIcon name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("game.battleTitle")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Teams + scores */}
        <View style={styles.teamsRow}>
          <View style={styles.teamCol}>
            <Text style={[styles.teamName, { color: leftColor }]} numberOfLines={2}>
              {leftName}
            </Text>
            <Text style={styles.points}>
              {leftPts === null ? "—" : formatPoints(leftPts, locale)}
            </Text>
            <Text style={styles.pct}>
              {leftPct === null ? "—" : `${leftPct.toFixed(1)}%`}
            </Text>
          </View>
          <Text style={styles.vs}>VS</Text>
          <View style={[styles.teamCol, styles.teamColRight]}>
            <Text style={[styles.teamName, { color: rightColor }]} numberOfLines={2}>
              {rightName}
            </Text>
            <Text style={styles.points}>
              {rightPts === null ? "—" : formatPoints(rightPts, locale)}
            </Text>
            <Text style={styles.pct}>
              {rightPct === null ? "—" : `${rightPct.toFixed(1)}%`}
            </Text>
          </View>
        </View>

        {leaderLabel ? <Text style={styles.leader}>{leaderLabel}</Text> : null}

        {/* Arena / rope balance */}
        <View style={styles.arena}>
          <ArenaAtmosphere leftColor={leftColor} rightColor={rightColor} />
          <View style={styles.arenaInner}>
            <Animated.View
              style={[styles.ropeTrack, { transform: [{ translateX: ropeAnim }] }]}
            >
              <View style={[styles.ropeEnd, { backgroundColor: leftColor }]} />
              <View style={styles.ropeBar} />
              <View style={[styles.ropeEnd, { backgroundColor: rightColor }]} />
            </Animated.View>
            <View style={styles.centerMark} />
          </View>
        </View>

        {/* Total power + countdown */}
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>{t("game.totalPower")}</Text>
          <Text style={styles.metaValue}>
            {totalPts === null ? "—" : formatPoints(totalPts, locale)}
          </Text>
          <Text style={styles.metaLabel}>{t("game.weekEndsIn")}</Text>
          <Text style={styles.countdown}>
            {formatCountdown(countdownMs, t("game.countdownDaySuffix"))}
          </Text>
          {wakingUp ? (
            <Text style={styles.wakingHint}>{t("online.wakingUp")}</Text>
          ) : null}
        </View>

        {error && !state ? (
          <View style={styles.errorBox}>
            <AppIcon name="cloud-offline-outline" size={28} color={theme.textMuted} />
            <Text style={styles.errorTitle}>{t("game.loadFailedTitle")}</Text>
            <Text style={styles.errorText}>{t("game.loadFailedText")}</Text>
            <Pressable
              style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
              onPress={() => {
                setLoading(true);
                loadState();
              }}
            >
              <Text style={styles.retryBtnText}>{t("online.retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        {loading && !state ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.rope} />
            <Text style={styles.loadingText}>{t("game.loadingBattle")}</Text>
          </View>
        ) : null}

        {/* Side selection */}
        <Text style={styles.sectionTitle}>{t("game.fightForSide")}</Text>
        <View style={styles.sideRow}>
          <Pressable
            style={[
              styles.sideBtn,
              { borderColor: leftColor },
              selectedSide === "left" && { backgroundColor: `${leftColor}33` },
            ]}
            onPress={() => setSelectedSide("left")}
          >
            <Text style={[styles.sideBtnText, { color: leftColor }]} numberOfLines={1}>
              {leftName}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.sideBtn,
              { borderColor: rightColor },
              selectedSide === "right" && { backgroundColor: `${rightColor}33` },
            ]}
            onPress={() => setSelectedSide("right")}
          >
            <Text style={[styles.sideBtnText, { color: rightColor }]} numberOfLines={1}>
              {rightName}
            </Text>
          </Pressable>
        </View>

        {/* Challenge cards — static definitions; placeholder click only */}
        {ONLINE_CHALLENGES.map((challenge) => {
          const prefix = `game.challenges.${challenge.i18nKey}`;
          const cooldownLabel =
            challenge.cooldownSeconds === 0
              ? t("game.cooldownNone")
              : challenge.cooldownSeconds === 3600
                ? t("game.cooldown60")
                : t("game.cooldown10");
          const rewardLabel =
            challenge.rewardTier === "high"
              ? t("game.rewardHigh")
              : challenge.rewardTier === "medium"
                ? t("game.rewardMedium")
                : t("game.rewardSkill");

          return (
            <Pressable
              key={challenge.type}
              style={({ pressed }) => [
                styles.challengeCard,
                pressed && styles.challengeCardPressed,
                !selectedSide && styles.challengeCardDisabled,
              ]}
              onPress={() => onChallengePress(challenge.type)}
            >
              <View style={styles.challengeIconWrap}>
                <AppIcon name={challenge.icon} size={22} color={theme.rope} />
              </View>
              <View style={styles.challengeBody}>
                <Text style={styles.challengeTitle}>{t(`${prefix}.title`)}</Text>
                <Text style={styles.challengeSubtitle}>{t(`${prefix}.subtitle`)}</Text>
                <View style={styles.challengeMeta}>
                  <Text style={styles.challengeMetaText}>{rewardLabel}</Text>
                  <Text style={styles.challengeDot}>·</Text>
                  <Text style={styles.challengeMetaText}>{cooldownLabel}</Text>
                </View>
              </View>
              <AppIcon name="chevron-forward" size={18} color={theme.textDim} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...type.screenTitle,
    flex: 1,
    letterSpacing: 1,
  },
  headerSpacer: { width: 40 },
  scroll: {
    paddingHorizontal: 16,
    gap: 14,
  },
  teamsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 4,
  },
  teamCol: {
    flex: 1,
    gap: 4,
  },
  teamColRight: {
    alignItems: "flex-end",
  },
  teamName: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    letterSpacing: 0.3,
  },
  points: {
    fontFamily: theme.fonts.display,
    fontSize: 32,
    color: theme.text,
    letterSpacing: 1,
  },
  pct: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 15,
    color: theme.ropeSoft,
  },
  vs: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.textDim,
    marginHorizontal: 8,
    marginTop: 28,
  },
  leader: {
    textAlign: "center",
    fontFamily: theme.fonts.semiBold,
    fontSize: 13,
    color: theme.gold,
    letterSpacing: 0.4,
  },
  arena: {
    height: 120,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  arenaInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ropeTrack: {
    flexDirection: "row",
    alignItems: "center",
    width: WINDOW_WIDTH * 0.7,
  },
  ropeBar: {
    flex: 1,
    height: 8,
    backgroundColor: theme.rope,
    borderRadius: 4,
    shadowColor: theme.ropeSoft,
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 3,
  },
  ropeEnd: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  centerMark: {
    position: "absolute",
    width: 3,
    height: 36,
    borderRadius: 2,
    backgroundColor: theme.ropeSoft,
    opacity: 0.85,
  },
  metaCard: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  metaLabel: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  metaValue: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.text,
    marginBottom: 8,
  },
  countdown: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.ropeSoft,
  },
  wakingHint: {
    marginTop: 6,
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.textMuted,
    textAlign: "center",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.textMuted,
  },
  errorBox: {
    alignItems: "center",
    gap: 8,
    padding: 16,
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  errorTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.text,
  },
  errorText: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 6,
    backgroundColor: theme.ember,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnPressed: { opacity: 0.85 },
  retryBtnText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.white,
  },
  sectionTitle: {
    marginTop: 6,
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.text,
    letterSpacing: 1.2,
  },
  sideRow: {
    flexDirection: "row",
    gap: 10,
  },
  sideBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    backgroundColor: theme.surface,
  },
  sideBtnText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
  },
  challengeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.surfaceRaised,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  challengeCardPressed: {
    opacity: 0.9,
    borderColor: theme.rope,
  },
  challengeCardDisabled: {
    opacity: 0.72,
  },
  challengeIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  challengeBody: {
    flex: 1,
    gap: 2,
  },
  challengeTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.text,
  },
  challengeSubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.textMuted,
  },
  challengeMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  challengeMetaText: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 11,
    color: theme.ropeSoft,
    letterSpacing: 0.3,
  },
  challengeDot: {
    color: theme.textDim,
    fontSize: 11,
  },
});
