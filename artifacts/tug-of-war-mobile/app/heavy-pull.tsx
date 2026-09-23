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
const MAX_POSITION = 100;
const CHARGE_MS = 1_100;
const HEAVE_POWER_MAX = 32;
const MIN_CHARGE_TO_HEAVE = 0.18;
const DRAG_PER_SEC = 14;
const TICK_MS = 50;

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
  const [timeLeftMs, setTimeLeftMs] = useState(10_000);
  const [heaves, setHeaves] = useState(0);
  const [position, setPosition] = useState(0);
  const [peak, setPeak] = useState(0);
  const [charge, setCharge] = useState(0);
  const [holding, setHolding] = useState(false);
  const [result, setResult] = useState<ChallengeCompleteResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [claimingX2, setClaimingX2] = useState(false);
  const [x2Done, setX2Done] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);

  const playTokenRef = useRef<string | null>(null);
  const durationMsRef = useRef(10_000);
  const heavesRef = useRef(0);
  const positionRef = useRef(0);
  const peakRef = useRef(0);
  const chargeRef = useRef(0);
  const holdingRef = useRef(false);
  const holdStartedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const lastTickRef = useRef(0);

  const pulse = useRef(new Animated.Value(1)).current;
  const pullProgress = useRef(new Animated.Value(0)).current;
  const chargeAnim = useRef(new Animated.Value(0)).current;
  const charBob = useRef(new Animated.Value(0)).current;
  const heaveFlash = useRef(new Animated.Value(0)).current;
  const arenaShake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    preloadFeedback();
  }, []);

  const syncVisual = useCallback(
    (pos: number) => {
      Animated.spring(pullProgress, {
        toValue: Math.min(1, pos / MAX_POSITION),
        friction: 8,
        tension: 60,
        useNativeDriver: false,
      }).start();
    },
    [pullProgress],
  );

  const finishAndSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    holdingRef.current = false;
    setHolding(false);
    setPhase("submitting");
    try {
      const session = await ensureSession();
      const playToken = playTokenRef.current;
      if (!playToken) throw new Error("missing_token");
      const peakPosition = Math.max(0, Math.min(MAX_POSITION, Math.floor(peakRef.current)));
      const res = await completeHeavyPull(
        {
          playToken,
          tapCount: heavesRef.current,
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

  /** Physics loop: charge while held, constant drag, timer. */
  useEffect(() => {
    if (phase !== "playing") return;
    const started = Date.now();
    const duration = durationMsRef.current;
    lastTickRef.current = started;

    const id = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.12, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;

      const left = Math.max(0, duration - (now - started));
      setTimeLeftMs(left);
      if (left <= 0) {
        clearInterval(id);
        finishAndSubmit();
        return;
      }

      // Charge while holding
      if (holdingRef.current) {
        const heldMs = now - holdStartedAtRef.current;
        const nextCharge = Math.min(1, heldMs / CHARGE_MS);
        chargeRef.current = nextCharge;
        setCharge(nextCharge);
        chargeAnim.setValue(nextCharge);
      }

      // Constant drag (even while charging — weight keeps pulling back)
      if (positionRef.current > 0) {
        const nextPos = Math.max(0, positionRef.current - DRAG_PER_SEC * dt);
        positionRef.current = nextPos;
        setPosition(Math.floor(nextPos));
        syncVisual(nextPos);
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [phase, finishAndSubmit, syncVisual, chargeAnim]);

  const releaseHeave = useCallback(() => {
    if (phase !== "playing" || !holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);

    const charged = chargeRef.current;
    chargeRef.current = 0;
    setCharge(0);
    Animated.timing(chargeAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: false,
    }).start();

    if (charged < MIN_CHARGE_TO_HEAVE) {
      feedbackTick(true);
      return;
    }

    const power = charged * HEAVE_POWER_MAX;
    const nextPos = Math.min(MAX_POSITION, positionRef.current + power);
    positionRef.current = nextPos;
    setPosition(Math.floor(nextPos));
    if (nextPos > peakRef.current) {
      peakRef.current = nextPos;
      setPeak(Math.floor(nextPos));
    }
    heavesRef.current += 1;
    setHeaves(heavesRef.current);
    syncVisual(nextPos);
    feedbackPull();

    pulse.setValue(0.88);
    Animated.spring(pulse, {
      toValue: 1,
      friction: 4,
      tension: 160,
      useNativeDriver: true,
    }).start();

    charBob.setValue(-14);
    Animated.spring(charBob, {
      toValue: 0,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();

    heaveFlash.setValue(1);
    Animated.timing(heaveFlash, {
      toValue: 0,
      duration: 380,
      useNativeDriver: true,
    }).start();

    arenaShake.setValue(0);
    Animated.sequence([
      Animated.timing(arenaShake, { toValue: 10, duration: 35, useNativeDriver: true }),
      Animated.timing(arenaShake, { toValue: -10, duration: 45, useNativeDriver: true }),
      Animated.timing(arenaShake, { toValue: 6, duration: 35, useNativeDriver: true }),
      Animated.timing(arenaShake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [phase, chargeAnim, syncVisual, pulse, charBob, heaveFlash, arenaShake]);

  const onPressIn = () => {
    if (phase !== "playing" || submittedRef.current) return;
    holdingRef.current = true;
    holdStartedAtRef.current = Date.now();
    chargeRef.current = 0;
    setCharge(0);
    setHolding(true);
    chargeAnim.setValue(0);
  };

  const onPressOut = () => {
    releaseHeave();
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
  const strengthWidth = pullProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const chargeWidth = chargeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const btnLabel = holding
    ? charge >= 0.95
      ? t("game.heavyPull.release")
      : t("game.heavyPull.charging")
    : t("game.heavyPull.hold");

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
              <Text style={styles.peakVal}>{Math.max(peak, Math.floor(position))}</Text>
              <Text style={styles.peakLabel}>{t("game.heavyPull.peak")}</Text>
            </View>
          </View>

          <View style={styles.meterBlock}>
            <View style={styles.meterTrack}>
              <Animated.View
                style={[styles.meterFill, { width: strengthWidth, backgroundColor: teamColor }]}
              />
            </View>
            <Text style={styles.meterLabel}>{t("game.heavyPull.powerMeter")}</Text>
          </View>

          <Animated.View style={[styles.arena, { transform: [{ translateX: arenaShake }] }]}>
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
              <Animated.Text style={[styles.heaveFlash, { opacity: heaveFlash }]}>
                {t("game.heavyPull.heave")}
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
              <Text style={styles.oppTag}>{t("game.heavyPull.weight")}</Text>
            </Animated.View>
          </Animated.View>

          <View style={styles.chargeBlock}>
            <View style={styles.chargeTrack}>
              <Animated.View
                style={[
                  styles.chargeFill,
                  {
                    width: chargeWidth,
                    backgroundColor: charge >= 0.95 ? theme.gold : theme.ember,
                  },
                ]}
              />
            </View>
            <Text style={styles.chargeLabel}>{t("game.heavyPull.chargeMeter")}</Text>
          </View>

          <Animated.View style={{ transform: [{ scale: pulse }], width: "100%" }}>
            <Pressable
              style={[
                styles.pullBtn,
                { backgroundColor: holding ? theme.ember : teamColor },
                holding && charge >= 0.95 && styles.pullBtnReady,
              ]}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              onResponderTerminate={onPressOut}
            >
              <Text style={styles.pullBtnText}>{btnLabel}</Text>
            </Pressable>
          </Animated.View>
          <Text style={styles.hint}>{t("game.heavyPull.playHint")}</Text>
          <Text style={styles.heaveHint}>
            {t("game.heavyPull.heaves", { count: heaves })}
          </Text>
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
    gap: 6,
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
  peakVal: { fontFamily: theme.fonts.display, fontSize: 36, color: theme.gold },
  peakLabel: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  meterBlock: { width: "100%", gap: 4 },
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
  },
  chargeBlock: { width: "100%", gap: 4 },
  chargeTrack: {
    width: "100%",
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.surface,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
  },
  chargeFill: { height: "100%", borderRadius: 7 },
  chargeLabel: {
    alignSelf: "flex-start",
    fontFamily: theme.fonts.semiBold,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
    minHeight: 140,
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
  heaveFlash: {
    position: "absolute",
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.gold,
    letterSpacing: 1,
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
  pullBtnReady: {
    borderWidth: 2,
    borderColor: theme.gold,
  },
  pullBtnText: {
    fontFamily: theme.fonts.display,
    fontSize: 32,
    color: theme.white,
    letterSpacing: 1,
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  heaveHint: {
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
