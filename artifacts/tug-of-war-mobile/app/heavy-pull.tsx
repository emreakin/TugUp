import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { theme, type } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  claimOnlineX2,
  completeHeavyPull,
  startHeavyPull,
  type BattleSide,
  type ChallengeCompleteResponse,
} from "@/lib/api";
import { feedbackPull, feedbackTick, feedbackWin, preloadFeedback } from "@/lib/feedback";

type Phase = "booting" | "countdown" | "playing" | "submitting" | "result" | "error";

/** Keep in sync with api-server challengePlay Heavy Pull constants. */
const MAX_POSITION = 100;
const FALL_PER_SEC = 55;
const DRAG_RESISTANCE = 0.75;
const TICK_MS = 32;
const MARKS = [25, 50, 75, 100];

function formatPoints(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale.startsWith("tr") ? "tr-TR" : "en-US").format(n);
  } catch {
    return String(n);
  }
}

export default function HeavyPullScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { ensureSession } = useAuth();
  const params = useLocalSearchParams<{
    matchupId?: string;
    side?: string;
    left?: string;
    right?: string;
    leftColor?: string;
    rightColor?: string;
  }>();

  const matchupId = params.matchupId ?? "";
  const side: BattleSide = params.side === "right" ? "right" : "left";
  const teamName =
    side === "left"
      ? params.left || t("game.defaultLeft")
      : params.right || t("game.defaultRight");
  const teamColor =
    side === "left" ? params.leftColor || "#ef4444" : params.rightColor || "#3b82f6";

  const [phase, setPhase] = useState<Phase>("booting");
  const [countdown, setCountdown] = useState(3);
  const [timeLeftMs, setTimeLeftMs] = useState(10_000);
  const [height, setHeight] = useState(0);
  const [peak, setPeak] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ChallengeCompleteResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [claimingX2, setClaimingX2] = useState(false);
  const [x2Done, setX2Done] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [trackH, setTrackH] = useState(0);

  const playTokenRef = useRef<string | null>(null);
  const durationMsRef = useRef(10_000);
  const heightRef = useRef(0);
  const peakRef = useRef(0);
  const effortRef = useRef(0);
  const draggingRef = useRef(false);
  const grabStartYRef = useRef(0);
  const grabStartHeightRef = useRef(0);
  const submittedRef = useRef(false);
  const lastTickRef = useRef(0);
  const lastFeedbackPeakRef = useRef(0);

  useEffect(() => {
    preloadFeedback();
  }, []);

  const finishAndSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    draggingRef.current = false;
    setDragging(false);
    setPhase("submitting");
    try {
      const session = await ensureSession();
      const playToken = playTokenRef.current;
      if (!playToken) throw new Error("missing_token");
      const peakPosition = Math.max(0, Math.min(MAX_POSITION, Math.floor(peakRef.current)));
      const effort = Math.max(0, Math.floor(effortRef.current));
      const res = await completeHeavyPull(
        {
          playToken,
          tapCount: effort,
          finalPosition: peakPosition,
        },
        session.token,
      );
      setResult(res);
      setTotalPoints(res.pointsAwarded);
      setPhase("result");
      feedbackWin();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("game.heavyPull.submitFailed");
      setErrorMsg(msg);
      setPhase("error");
      feedbackTick(true);
    }
  }, [ensureSession, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!matchupId) {
        setErrorMsg(t("game.heavyPull.missingMatchup"));
        setPhase("error");
        return;
      }
      try {
        const session = await ensureSession();
        const started = await startHeavyPull({ matchupId, side }, session.token);
        if (cancelled) return;
        playTokenRef.current = started.playToken;
        durationMsRef.current = started.durationMs;
        setTimeLeftMs(started.durationMs);
        setPhase("countdown");
        setCountdown(3);
      } catch (err) {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : "";
        setErrorMsg(raw || t("game.heavyPull.startFailed"));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchupId, side, ensureSession, t]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("playing");
      setTimeLeftMs(durationMsRef.current);
      return;
    }
    feedbackTick(countdown <= 1);
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown]);

  /** Gravity + timer. While dragging, height is driven by touch. */
  useEffect(() => {
    if (phase !== "playing") return;
    const started = Date.now();
    const duration = durationMsRef.current;
    lastTickRef.current = started;

    const id = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;

      const left = Math.max(0, duration - (now - started));
      setTimeLeftMs(left);
      if (left <= 0) {
        clearInterval(id);
        finishAndSubmit();
        return;
      }

      if (!draggingRef.current && heightRef.current > 0) {
        const next = Math.max(0, heightRef.current - FALL_PER_SEC * dt);
        heightRef.current = next;
        setHeight(Math.floor(next));
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [phase, finishAndSubmit]);

  const applyHeight = (next: number) => {
    const prev = heightRef.current;
    const clamped = Math.max(0, Math.min(MAX_POSITION, next));
    const gained = clamped - prev;
    if (gained > 0) {
      effortRef.current += gained;
    }
    heightRef.current = clamped;
    setHeight(Math.floor(clamped));
    if (clamped > peakRef.current) {
      peakRef.current = clamped;
      setPeak(Math.floor(clamped));
      if (clamped - lastFeedbackPeakRef.current >= 8) {
        lastFeedbackPeakRef.current = clamped;
        feedbackPull();
      }
    }
  };

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackH(e.nativeEvent.layout.height);
  };

  const onGrabStart = (pageY: number) => {
    if (phase !== "playing" || submittedRef.current) return;
    draggingRef.current = true;
    setDragging(true);
    grabStartYRef.current = pageY;
    grabStartHeightRef.current = heightRef.current;
  };

  const onGrabMove = (pageY: number) => {
    if (!draggingRef.current || phase !== "playing" || trackH <= 0) return;
    const dy = grabStartYRef.current - pageY; // finger up → positive
    const deltaPct = (dy / trackH) * 100 * DRAG_RESISTANCE;
    applyHeight(grabStartHeightRef.current + deltaPct);
  };

  const onGrabEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
  };

  const onClaimX2 = async () => {
    if (!result?.x2ClaimToken || claimingX2 || x2Done) return;
    setClaimingX2(true);
    try {
      const runClaim = async () => {
        const session = await ensureSession();
        const claimed = await claimOnlineX2(result.x2ClaimToken!, session.token);
        setTotalPoints(result.pointsAwarded + claimed.bonusPoints);
        setX2Done(true);
        setResult({
          ...result,
          canClaimX2: false,
          x2ClaimToken: null,
          x2RemainingToday: claimed.x2RemainingToday,
          battleState: claimed.battleState,
        });
      };

      if (Platform.OS === "web") {
        await runClaim();
      } else {
        const { loadRewardedAd } = require("../native/ad-helper");
        await new Promise<void>((resolve, reject) => {
          loadRewardedAd(
            async () => {
              try {
                await runClaim();
                resolve();
              } catch (e) {
                reject(e);
              }
            },
            (err: unknown) => reject(err ?? new Error("ad_failed")),
          );
        });
      }
    } catch {
      Alert.alert(t("common.error"), t("game.heavyPull.x2Failed"));
    } finally {
      setClaimingX2(false);
    }
  };

  const goBackToBattle = () => router.back();
  const secondsLeft = Math.ceil(timeLeftMs / 1000);
  const locale = i18n.language || "en";
  const handleBottomPct = height; // 0 at bottom, 100 at top
  const peakBottomPct = peak;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Pressable onPress={goBackToBattle} hitSlop={12} style={styles.backBtn}>
          <AppIcon name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("game.challenges.heavyPull.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={[styles.fightingFor, { color: teamColor }]}>
        {t("game.fightingFor", { team: teamName })}
      </Text>

      {phase === "booting" || phase === "submitting" ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={theme.rope} size="large" />
          <Text style={styles.hint}>
            {phase === "booting"
              ? t("game.heavyPull.preparing")
              : t("game.heavyPull.submitting")}
          </Text>
        </View>
      ) : null}

      {phase === "countdown" ? (
        <View style={styles.centerBlock}>
          <Text style={styles.countdownNum}>
            {countdown > 0 ? countdown : t("game.heavyPull.go")}
          </Text>
          <Text style={styles.hint}>{t("game.heavyPull.countdownHint")}</Text>
          <AppIcon name="arrow-up" size={48} color={theme.rope} />
        </View>
      ) : null}

      {phase === "playing" ? (
        <View style={styles.playBlock}>
          <View style={styles.hudRow}>
            <Text style={[styles.timer, secondsLeft <= 3 && styles.timerUrgent]}>
              {secondsLeft}
              <Text style={styles.timerUnit}>s</Text>
            </Text>
            <View style={styles.hudRight}>
              <Text style={styles.peakVal}>{peak}</Text>
              <Text style={styles.peakLabel}>{t("game.heavyPull.peak")}</Text>
            </View>
          </View>

          <Text style={styles.instruction}>
            <Text style={styles.instructionArrow}>↑ </Text>
            {t("game.heavyPull.instruction")}
          </Text>

          <View
            style={styles.track}
            onLayout={onTrackLayout}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => onGrabStart(e.nativeEvent.pageY)}
            onResponderMove={(e) => onGrabMove(e.nativeEvent.pageY)}
            onResponderRelease={onGrabEnd}
            onResponderTerminate={onGrabEnd}
          >
            {/* Shaft */}
            <View style={styles.shaft} />

            {/* Peak ghost line */}
            {peak > 0 ? (
              <View style={[styles.peakLine, { bottom: `${peakBottomPct}%` }]} />
            ) : null}

            {/* Tick lines + labels */}
            {MARKS.map((m) => (
              <View key={`t-${m}`} style={[styles.tickRow, { bottom: `${m}%` }]}>
                <Text style={styles.markLabel}>{m}</Text>
                <View style={styles.tick} />
              </View>
            ))}

            {/* Rope from bottom to handle */}
            <View
              style={[
                styles.ropeFill,
                {
                  height: `${Math.max(4, handleBottomPct)}%`,
                  backgroundColor: teamColor,
                },
              ]}
            />

            {/* Weight / handle */}
            <View
              style={[
                styles.handle,
                {
                  bottom: `${handleBottomPct}%`,
                  borderColor: dragging ? theme.gold : teamColor,
                  backgroundColor: dragging ? theme.ember : theme.surfaceRaised,
                  transform: [{ translateY: 22 }],
                },
              ]}
            >
              <Image
                source={require("@/assets/images/character.png")}
                style={styles.handleChar}
                resizeMode="contain"
              />
              <Text style={styles.handleVal}>{Math.floor(height)}</Text>
            </View>

            {/* Floor weight */}
            <View style={styles.floorBlock}>
              <AppIcon name="fitness" size={20} color={theme.textMuted} />
              <Text style={styles.floorText}>{t("game.heavyPull.weight")}</Text>
            </View>
          </View>

          <Text style={styles.hint}>{t("game.heavyPull.playHint")}</Text>
        </View>
      ) : null}

      {phase === "result" && result ? (
        <View style={styles.resultBlock}>
          <AppIcon name="fitness" size={40} color={theme.gold} />
          <Text style={styles.resultTitle}>{t("game.heavyPull.resultTitle")}</Text>
          <Text style={styles.resultPoints}>+{formatPoints(totalPoints, locale)}</Text>
          <Text style={styles.hint}>
            {t("game.heavyPull.resultDetail", {
              position: result.finalPosition ?? Math.floor(peak),
            })}
          </Text>
          {result.canClaimX2 && !x2Done ? (
            <Pressable
              style={[styles.x2Btn, claimingX2 && styles.x2BtnDisabled]}
              onPress={onClaimX2}
              disabled={claimingX2}
            >
              {claimingX2 ? (
                <ActivityIndicator color={theme.white} />
              ) : (
                <Text style={styles.x2BtnText}>
                  {t("game.heavyPull.watchAdX2", {
                    remaining: result.x2RemainingToday,
                  })}
                </Text>
              )}
            </Pressable>
          ) : null}
          {x2Done ? (
            <Text style={styles.x2DoneText}>{t("game.heavyPull.x2Applied")}</Text>
          ) : null}
          <Pressable style={styles.doneBtn} onPress={goBackToBattle}>
            <Text style={styles.doneBtnText}>{t("game.heavyPull.backToBattle")}</Text>
          </Pressable>
        </View>
      ) : null}

      {phase === "error" ? (
        <View style={styles.centerBlock}>
          <AppIcon name="alert-circle" size={36} color={theme.danger} />
          <Text style={styles.errorTitle}>{t("game.heavyPull.errorTitle")}</Text>
          <Text style={styles.hint}>{errorMsg}</Text>
          <Pressable style={styles.doneBtn} onPress={goBackToBattle}>
            <Text style={styles.doneBtnText}>{t("game.heavyPull.backToBattle")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 16 },
  header: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...type.screenTitle, flex: 1 },
  headerSpacer: { width: 40 },
  fightingFor: {
    textAlign: "center",
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    marginBottom: 4,
  },
  centerBlock: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  playBlock: { flex: 1, gap: 8, paddingBottom: 4 },
  hudRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  hudRight: { alignItems: "flex-end" },
  countdownNum: {
    fontFamily: theme.fonts.display,
    fontSize: 96,
    color: theme.rope,
    letterSpacing: 2,
  },
  timer: { fontFamily: theme.fonts.display, fontSize: 44, color: theme.text },
  timerUnit: { fontSize: 20, color: theme.textMuted },
  timerUrgent: { color: theme.danger },
  peakVal: { fontFamily: theme.fonts.display, fontSize: 36, color: theme.gold },
  peakLabel: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  instruction: {
    textAlign: "center",
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.text,
    marginBottom: 2,
  },
  instructionArrow: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.gold,
  },
  trackRow: { flex: 1, minHeight: 280 },
  track: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    marginVertical: 4,
    overflow: "hidden",
    position: "relative",
  },
  shaft: {
    position: "absolute",
    left: "50%",
    marginLeft: -6,
    top: 24,
    bottom: 48,
    width: 12,
    borderRadius: 6,
    backgroundColor: theme.border,
  },
  tickRow: {
    position: "absolute",
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  markLabel: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 12,
    color: theme.textDim,
    width: 28,
  },
  tick: {
    flex: 1,
    height: 1,
    backgroundColor: `${theme.textDim}55`,
  },
  peakLine: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: theme.gold,
    opacity: 0.7,
  },
  ropeFill: {
    position: "absolute",
    left: "50%",
    marginLeft: -4,
    bottom: 48,
    width: 8,
    borderRadius: 4,
    opacity: 0.85,
  },
  handle: {
    position: "absolute",
    alignSelf: "center",
    left: "50%",
    marginLeft: -44,
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  handleChar: { width: 48, height: 48 },
  handleVal: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    color: theme.text,
    marginTop: -2,
  },
  floorBlock: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 2,
  },
  floorText: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 10,
    color: theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  resultBlock: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  resultTitle: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.text },
  resultPoints: {
    fontFamily: theme.fonts.display,
    fontSize: 56,
    color: theme.gold,
    letterSpacing: 1,
  },
  x2Btn: {
    marginTop: 8,
    backgroundColor: theme.ember,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: "80%",
    alignItems: "center",
  },
  x2BtnDisabled: { opacity: 0.7 },
  x2BtnText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.white,
    textAlign: "center",
  },
  x2DoneText: { fontFamily: theme.fonts.semiBold, fontSize: 13, color: theme.success },
  doneBtn: {
    marginTop: 16,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  doneBtnText: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.text },
  errorTitle: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.text },
});
