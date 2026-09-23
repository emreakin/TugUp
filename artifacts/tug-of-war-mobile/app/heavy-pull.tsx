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
const FALL_PER_SEC = 80;
const FALL_WHILE_GRIP = 36;
const DRAG_RESISTANCE = 0.32;
const TICK_MS = 32;
const MARKS = [25, 50, 75, 100];
/** Top band reserved for the lifter avatar (not part of lift range). */
const LIFTER_BAND = 0.22;
const WEIGHT_SIZE = 72;

function formatPoints(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale.startsWith("tr") ? "tr-TR" : "en-US").format(n);
  } catch {
    return String(n);
  }
}

/** Higher = harder. Near the top, each yank barely moves the weight. */
function heightResistance(h: number): number {
  const t = Math.max(0, Math.min(1, h / MAX_POSITION));
  return Math.max(0.1, 1 - Math.pow(t, 1.15) * 0.88);
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
  const lastPageYRef = useRef(0);
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

  /** Gravity always applies — gripping only slows the fall. */
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

      if (heightRef.current > 0) {
        const fallRate = draggingRef.current ? FALL_WHILE_GRIP : FALL_PER_SEC;
        const next = Math.max(0, heightRef.current - fallRate * dt);
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
      if (clamped - lastFeedbackPeakRef.current >= 6) {
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
    lastPageYRef.current = pageY;
  };

  const onGrabMove = (pageY: number) => {
    if (!draggingRef.current || phase !== "playing" || trackH <= 0) return;
    const dy = lastPageYRef.current - pageY; // finger up → positive
    lastPageYRef.current = pageY;
    if (dy <= 0) return;

    const liftSpan = trackH * (1 - LIFTER_BAND);
    const rawGain = (dy / liftSpan) * 100 * DRAG_RESISTANCE;
    const gain = rawGain * heightResistance(heightRef.current);
    applyHeight(heightRef.current + gain);
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

  /** Weight travels in the lower (1 - LIFTER_BAND) of the track. */
  const weightBottomPct = height * (1 - LIFTER_BAND);
  const peakBottomPct = peak * (1 - LIFTER_BAND);

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
          <Image
            source={require("@/assets/images/character_heavy_pull.png")}
            style={styles.countdownChar}
            resizeMode="contain"
          />
          <Text style={styles.countdownNum}>
            {countdown > 0 ? countdown : t("game.heavyPull.go")}
          </Text>
          <Text style={styles.hint}>{t("game.heavyPull.countdownHint")}</Text>
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
            {/* Lifter fixed at top — pulls rope from below */}
            <View style={styles.lifterSlot}>
              <Image
                source={require("@/assets/images/character_heavy_pull.png")}
                style={styles.lifterImg}
                resizeMode="contain"
              />
            </View>

            {/* Peak ghost */}
            {peak > 0 ? (
              <View style={[styles.peakLine, { bottom: `${peakBottomPct}%` }]} />
            ) : null}

            {MARKS.map((m) => (
              <View
                key={`t-${m}`}
                style={[styles.tickRow, { bottom: `${m * (1 - LIFTER_BAND)}%` }]}
              >
                <Text style={styles.markLabel}>{m}</Text>
                <View style={styles.tick} />
              </View>
            ))}

            {/* Vertical rope: from under lifter down to the weight */}
            <View
              style={[
                styles.ropeLine,
                {
                  bottom: `${weightBottomPct}%`,
                  top: `${LIFTER_BAND * 100 - 2}%`,
                  backgroundColor: theme.rope,
                },
              ]}
            />

            {/* Rising weight */}
            <View
              style={[
                styles.weight,
                {
                  bottom: `${weightBottomPct}%`,
                  borderColor: dragging ? theme.gold : teamColor,
                  transform: [{ translateY: WEIGHT_SIZE / 2 }],
                },
              ]}
            >
              <Image
                source={require("@/assets/images/bowling-ball.png")}
                style={styles.weightImg}
                resizeMode="contain"
              />
              <Text style={styles.weightVal}>{Math.floor(height)}</Text>
            </View>

            <View style={styles.floorHint}>
              <Text style={styles.floorText}>{t("game.heavyPull.weight")}</Text>
            </View>
          </View>

          <Text style={styles.hint}>{t("game.heavyPull.playHint")}</Text>
        </View>
      ) : null}

      {phase === "result" && result ? (
        <View style={styles.resultBlock}>
          <Image
            source={require("@/assets/images/character_heavy_pull.png")}
            style={styles.resultChar}
            resizeMode="contain"
          />
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
  centerBlock: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  countdownChar: { width: 140, height: 160, marginBottom: 4 },
  playBlock: { flex: 1, gap: 8, paddingBottom: 4 },
  hudRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  hudRight: { alignItems: "flex-end" },
  countdownNum: {
    fontFamily: theme.fonts.display,
    fontSize: 72,
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
    fontSize: 17,
    color: theme.text,
  },
  instructionArrow: {
    fontFamily: theme.fonts.display,
    fontSize: 20,
    color: theme.gold,
  },
  track: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    marginVertical: 4,
    overflow: "hidden",
    position: "relative",
    minHeight: 280,
  },
  lifterSlot: {
    position: "absolute",
    top: 4,
    left: 0,
    right: 0,
    height: "22%",
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 6,
  },
  lifterImg: { width: 110, height: "100%" },
  tickRow: {
    position: "absolute",
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    zIndex: 1,
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
    opacity: 0.75,
    zIndex: 2,
  },
  ropeLine: {
    position: "absolute",
    left: "50%",
    marginLeft: -3,
    width: 6,
    borderRadius: 3,
    zIndex: 3,
    opacity: 0.95,
  },
  weight: {
    position: "absolute",
    alignSelf: "center",
    left: "50%",
    marginLeft: -WEIGHT_SIZE / 2,
    width: WEIGHT_SIZE,
    height: WEIGHT_SIZE,
    borderRadius: WEIGHT_SIZE / 2,
    borderWidth: 3,
    backgroundColor: theme.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  weightImg: { width: 44, height: 44 },
  weightVal: {
    position: "absolute",
    bottom: -2,
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    color: theme.gold,
  },
  floorHint: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: "center",
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
  resultBlock: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  resultChar: { width: 120, height: 140 },
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
