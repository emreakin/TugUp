import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
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

const { width: WINDOW_WIDTH } = Dimensions.get("window");
const CHAR_SIZE = 88;
const OPP_SIZE = 72;
const MAX_PULL_PX = WINDOW_WIDTH * 0.28;

/** Keep in sync with api-server challengePlay Heavy Pull constants. */
const UNIT_PER_TAP = 1.8;
const MAX_POSITION = 100;
const BURST_INTERVAL_MS = 2_500;
const BURST_SNAP = 8;

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
  const rivalColor =
    side === "left" ? params.rightColor || "#3b82f6" : params.leftColor || "#ef4444";

  const [phase, setPhase] = useState<Phase>("booting");
  const [countdown, setCountdown] = useState(3);
  const [timeLeftMs, setTimeLeftMs] = useState(20_000);
  const [taps, setTaps] = useState(0);
  const [position, setPosition] = useState(0);
  const [result, setResult] = useState<ChallengeCompleteResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [claimingX2, setClaimingX2] = useState(false);
  const [x2Done, setX2Done] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);

  const playTokenRef = useRef<string | null>(null);
  const durationMsRef = useRef(20_000);
  const tapsRef = useRef(0);
  const positionRef = useRef(0);
  const submittedRef = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const pullProgress = useRef(new Animated.Value(0)).current;
  const charBob = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const burstFlash = useRef(new Animated.Value(0)).current;
  const arenaShake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    preloadFeedback();
  }, []);

  const syncVisual = useCallback(
    (pos: number) => {
      Animated.spring(pullProgress, {
        toValue: Math.min(1, pos / MAX_POSITION),
        friction: 7,
        tension: 70,
        useNativeDriver: false,
      }).start();
    },
    [pullProgress],
  );

  const applyBurst = useCallback(() => {
    const next = Math.max(0, positionRef.current - BURST_SNAP);
    positionRef.current = next;
    setPosition(Math.floor(next));
    syncVisual(next);
    feedbackTick(true);

    burstFlash.setValue(1);
    Animated.timing(burstFlash, {
      toValue: 0,
      duration: 420,
      useNativeDriver: true,
    }).start();

    arenaShake.setValue(0);
    Animated.sequence([
      Animated.timing(arenaShake, { toValue: 8, duration: 40, useNativeDriver: true }),
      Animated.timing(arenaShake, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(arenaShake, { toValue: 5, duration: 40, useNativeDriver: true }),
      Animated.timing(arenaShake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [arenaShake, burstFlash, syncVisual]);

  const finishAndSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase("submitting");
    try {
      const session = await ensureSession();
      const playToken = playTokenRef.current;
      if (!playToken) throw new Error("missing_token");
      const finalPosition = Math.max(0, Math.min(MAX_POSITION, Math.floor(positionRef.current)));
      const res = await completeHeavyPull(
        {
          playToken,
          tapCount: tapsRef.current,
          finalPosition,
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

  useEffect(() => {
    if (phase !== "playing") return;
    const started = Date.now();
    const duration = durationMsRef.current;
    const tickId = setInterval(() => {
      const left = Math.max(0, duration - (Date.now() - started));
      setTimeLeftMs(left);
      if (left <= 0) {
        clearInterval(tickId);
        finishAndSubmit();
      }
    }, 50);

    const burstId = setInterval(() => {
      applyBurst();
    }, BURST_INTERVAL_MS);

    return () => {
      clearInterval(tickId);
      clearInterval(burstId);
    };
  }, [phase, finishAndSubmit, applyBurst]);

  const onPull = () => {
    if (phase !== "playing") return;
    tapsRef.current += 1;
    setTaps(tapsRef.current);

    const next = Math.min(MAX_POSITION, positionRef.current + UNIT_PER_TAP);
    positionRef.current = next;
    setPosition(Math.floor(next));
    syncVisual(next);
    feedbackPull();

    pulse.setValue(0.92);
    Animated.spring(pulse, {
      toValue: 1,
      friction: 4,
      tension: 140,
      useNativeDriver: true,
    }).start();

    charBob.setValue(-6);
    Animated.spring(charBob, {
      toValue: 0,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();

    flashOpacity.setValue(1);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
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
  const oppShift = pullProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -MAX_PULL_PX],
  });
  const meterWidth = pullProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
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
              <Text style={styles.positionVal}>{position}</Text>
              <Text style={styles.positionLabel}>{t("game.heavyPull.position")}</Text>
            </View>
          </View>

          <View style={styles.meterTrack}>
            <Animated.View
              style={[styles.meterFill, { width: meterWidth, backgroundColor: teamColor }]}
            />
          </View>
          <Text style={styles.meterLabel}>{t("game.heavyPull.powerMeter")}</Text>

          <Animated.View
            style={[styles.arena, { transform: [{ translateX: arenaShake }] }]}
          >
            <Animated.View style={[styles.charSlot, { transform: [{ translateX: charBob }] }]}>
              <Image
                source={require("@/assets/images/character.png")}
                style={styles.charImg}
                resizeMode="contain"
              />
              <Text style={[styles.arenaTag, { color: teamColor }]} numberOfLines={1}>
                {teamName}
              </Text>
            </Animated.View>

            <View style={styles.ropeSlot}>
              <Image
                source={require("@/assets/images/rope.png")}
                style={styles.ropeImg}
                resizeMode="stretch"
              />
              <Animated.Text style={[styles.plusFlash, { opacity: flashOpacity }]}>
                +
              </Animated.Text>
              <Animated.Text style={[styles.burstFlash, { opacity: burstFlash }]}>
                −{BURST_SNAP}
              </Animated.Text>
            </View>

            <Animated.View style={[styles.oppSlot, { transform: [{ translateX: oppShift }] }]}>
              <View
                style={[
                  styles.oppBlob,
                  { backgroundColor: `${rivalColor}55`, borderColor: rivalColor },
                ]}
              >
                <AppIcon name="fitness" size={28} color={rivalColor} />
              </View>
              <Text style={styles.oppTag}>{t("game.heavyPull.resistance")}</Text>
            </Animated.View>
          </Animated.View>

          <Animated.View style={{ transform: [{ scale: pulse }], width: "100%" }}>
            <Pressable
              style={[styles.pullBtn, { backgroundColor: teamColor }]}
              onPress={onPull}
            >
              <Text style={styles.pullBtnText}>{t("common.pull")}</Text>
            </Pressable>
          </Animated.View>
          <Text style={styles.hint}>{t("game.heavyPull.playHint")}</Text>
          <Text style={styles.tapHint}>{t("game.heavyPull.taps", { count: taps })}</Text>
        </View>
      ) : null}

      {phase === "result" && result ? (
        <View style={styles.resultBlock}>
          <AppIcon name="fitness" size={40} color={theme.gold} />
          <Text style={styles.resultTitle}>{t("game.heavyPull.resultTitle")}</Text>
          <Text style={styles.resultPoints}>+{formatPoints(totalPoints, locale)}</Text>
          <Text style={styles.hint}>
            {t("game.heavyPull.resultDetail", {
              position: result.finalPosition ?? position,
              count: result.tapCount,
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
  header: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...type.screenTitle, flex: 1 },
  headerSpacer: { width: 40 },
  fightingFor: {
    textAlign: "center",
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    marginBottom: 8,
  },
  centerBlock: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  playBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    gap: 8,
  },
  hudRow: {
    width: "100%",
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
  timer: { fontFamily: theme.fonts.display, fontSize: 48, color: theme.text },
  timerUnit: { fontSize: 22, color: theme.textMuted },
  timerUrgent: { color: theme.danger },
  positionVal: { fontFamily: theme.fonts.display, fontSize: 36, color: theme.ropeSoft },
  positionLabel: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  meterTrack: {
    width: "100%",
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.surface,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
  },
  meterFill: { height: "100%", borderRadius: 5 },
  meterLabel: {
    alignSelf: "flex-start",
    fontFamily: theme.fonts.semiBold,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: -4,
  },
  arena: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 18,
    paddingHorizontal: 10,
    minHeight: 150,
  },
  charSlot: { width: CHAR_SIZE + 8, alignItems: "center", zIndex: 2 },
  charImg: { width: CHAR_SIZE, height: CHAR_SIZE },
  arenaTag: {
    marginTop: 4,
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    maxWidth: CHAR_SIZE + 20,
  },
  ropeSlot: {
    flex: 1,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 4,
  },
  ropeImg: { width: "100%", height: 18 },
  plusFlash: {
    position: "absolute",
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.gold,
  },
  burstFlash: {
    position: "absolute",
    top: -18,
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.danger,
  },
  oppSlot: { width: OPP_SIZE + 16, alignItems: "center", zIndex: 1 },
  oppBlob: {
    width: OPP_SIZE,
    height: OPP_SIZE,
    borderRadius: OPP_SIZE / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  oppTag: {
    marginTop: 4,
    fontFamily: theme.fonts.semiBold,
    fontSize: 10,
    color: theme.textMuted,
  },
  pullBtn: {
    width: "100%",
    paddingVertical: 22,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pullBtnText: {
    fontFamily: theme.fonts.display,
    fontSize: 40,
    color: theme.white,
    letterSpacing: 2,
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  tapHint: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 12,
    color: theme.textDim,
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
