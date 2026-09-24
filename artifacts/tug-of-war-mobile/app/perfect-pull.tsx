import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
  completePerfectPull,
  startPerfectPull,
  type BattleSide,
  type ChallengeCompleteResponse,
} from "@/lib/api";
import { feedbackPull, feedbackTick, feedbackWin, preloadFeedback } from "@/lib/feedback";

type Phase = "booting" | "countdown" | "playing" | "submitting" | "result" | "error";

/** Keep in sync with api-server challengePlay Perfect Pull constants. */
const ROUNDS = 5;
const MAX_PER_ROUND = 4;
const MAX_SCORE = ROUNDS * MAX_PER_ROUND;
/** Needle position -1..1; |offset| thresholds → points. */
const TIER_PERFECT = 0.07;
const TIER_GREAT = 0.15;
const TIER_GOOD = 0.28;
const TIER_OK = 0.42;
/** Base oscillation speed (rad/s); increases each round. */
const BASE_SPEED = 2.4;
const SPEED_STEP = 0.45;

function formatPoints(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale.startsWith("tr") ? "tr-TR" : "en-US").format(n);
  } catch {
    return String(n);
  }
}

function pointsForOffset(absOffset: number): number {
  if (absOffset <= TIER_PERFECT) return 4;
  if (absOffset <= TIER_GREAT) return 3;
  if (absOffset <= TIER_GOOD) return 2;
  if (absOffset <= TIER_OK) return 1;
  return 0;
}

function gradeKey(pts: number): "perfect" | "great" | "good" | "ok" | "miss" {
  if (pts >= 4) return "perfect";
  if (pts >= 3) return "great";
  if (pts >= 2) return "good";
  if (pts >= 1) return "ok";
  return "miss";
}

export default function PerfectPullScreen() {
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
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lastHit, setLastHit] = useState<number | null>(null);
  const [lastGrade, setLastGrade] = useState<string | null>(null);
  const [needle, setNeedle] = useState(0);
  const [result, setResult] = useState<ChallengeCompleteResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [claimingX2, setClaimingX2] = useState(false);
  const [x2Done, setX2Done] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [locked, setLocked] = useState(false);

  const playTokenRef = useRef<string | null>(null);
  const scoreRef = useRef(0);
  const roundsRef = useRef(0);
  const needleRef = useRef(0);
  const submittedRef = useRef(false);
  const lockedRef = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const gaugeShake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    preloadFeedback();
  }, []);

  const finishAndSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase("submitting");
    try {
      const session = await ensureSession();
      const playToken = playTokenRef.current;
      if (!playToken) throw new Error("missing_token");
      const res = await completePerfectPull(
        {
          playToken,
          tapCount: roundsRef.current,
          finalPosition: scoreRef.current,
        },
        session.token,
      );
      setResult(res);
      setTotalPoints(res.pointsAwarded);
      setPhase("result");
      feedbackWin();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("game.perfectPull.submitFailed");
      setErrorMsg(msg);
      setPhase("error");
      feedbackTick(true);
    }
  }, [ensureSession, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!matchupId) {
        setErrorMsg(t("game.perfectPull.missingMatchup"));
        setPhase("error");
        return;
      }
      try {
        const session = await ensureSession();
        const started = await startPerfectPull({ matchupId, side }, session.token);
        if (cancelled) return;
        playTokenRef.current = started.playToken;
        setPhase("countdown");
        setCountdown(3);
      } catch (err) {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : "";
        setErrorMsg(raw || t("game.perfectPull.startFailed"));
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
      setRound(1);
      roundsRef.current = 0;
      scoreRef.current = 0;
      setScore(0);
      lockedRef.current = false;
      setLocked(false);
      return;
    }
    feedbackTick(countdown <= 1);
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown]);

  /** Oscillating needle while playing and not locked between rounds. */
  useEffect(() => {
    if (phase !== "playing" || locked) return;
    const speed = BASE_SPEED + (Math.max(0, round - 1)) * SPEED_STEP;
    const start = Date.now();
    const id = setInterval(() => {
      const t = ((Date.now() - start) / 1000) * speed;
      const pos = Math.sin(t);
      needleRef.current = pos;
      setNeedle(pos);
    }, 16);
    return () => clearInterval(id);
  }, [phase, round, locked]);

  const onPull = () => {
    if (phase !== "playing" || lockedRef.current || submittedRef.current) return;
    lockedRef.current = true;
    setLocked(true);

    const abs = Math.abs(needleRef.current);
    const pts = pointsForOffset(abs);
    const grade = gradeKey(pts);

    scoreRef.current = Math.min(MAX_SCORE, scoreRef.current + pts);
    roundsRef.current += 1;
    setScore(scoreRef.current);
    setLastHit(pts);
    setLastGrade(grade);
    setRound(roundsRef.current);

    if (pts >= 3) feedbackPull();
    else feedbackTick(pts === 0);

    pulse.setValue(0.9);
    Animated.spring(pulse, {
      toValue: 1,
      friction: 4,
      tension: 160,
      useNativeDriver: true,
    }).start();

    flashOpacity.setValue(1);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start();

    if (pts === 0) {
      Animated.sequence([
        Animated.timing(gaugeShake, { toValue: 8, duration: 40, useNativeDriver: true }),
        Animated.timing(gaugeShake, { toValue: -8, duration: 50, useNativeDriver: true }),
        Animated.timing(gaugeShake, { toValue: 0, duration: 40, useNativeDriver: true }),
      ]).start();
    }

    const done = roundsRef.current >= ROUNDS;
    setTimeout(() => {
      if (done) {
        finishAndSubmit();
      } else {
        lockedRef.current = false;
        setLocked(false);
        setRound(roundsRef.current + 1);
        setLastHit(null);
        setLastGrade(null);
      }
    }, 650);
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
      Alert.alert(t("common.error"), t("game.perfectPull.x2Failed"));
    } finally {
      setClaimingX2(false);
    }
  };

  const goBackToBattle = () => router.back();
  const locale = i18n.language || "en";
  const needlePct = ((needle + 1) / 2) * 100;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Pressable onPress={goBackToBattle} hitSlop={12} style={styles.backBtn}>
          <AppIcon name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("game.challenges.perfectPull.title")}</Text>
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
              ? t("game.perfectPull.preparing")
              : t("game.perfectPull.submitting")}
          </Text>
        </View>
      ) : null}

      {phase === "countdown" ? (
        <View style={styles.centerBlock}>
          <Text style={styles.countdownNum}>
            {countdown > 0 ? countdown : t("game.perfectPull.go")}
          </Text>
          <Text style={styles.hint}>{t("game.perfectPull.countdownHint")}</Text>
        </View>
      ) : null}

      {phase === "playing" ? (
        <View style={styles.playBlock}>
          <View style={styles.hudRow}>
            <Text style={styles.roundLabel}>
              {t("game.perfectPull.round", { current: Math.min(round, ROUNDS), total: ROUNDS })}
            </Text>
            <View style={styles.hudRight}>
              <Text style={styles.scoreVal}>{score}</Text>
              <Text style={styles.scoreLabel}>
                {t("game.perfectPull.scoreOf", { max: MAX_SCORE })}
              </Text>
            </View>
          </View>

          <Text style={styles.instruction}>{t("game.perfectPull.instruction")}</Text>

          <Animated.View style={[styles.gaugeWrap, { transform: [{ translateX: gaugeShake }] }]}>
            <View style={styles.gauge}>
              {/* Zones */}
              <View style={[styles.zone, styles.zoneMiss, { left: "0%", width: "29%" }]} />
              <View style={[styles.zone, styles.zoneOk, { left: "29%", width: "6.5%" }]} />
              <View style={[styles.zone, styles.zoneGood, { left: "35.5%", width: "6.5%" }]} />
              <View style={[styles.zone, styles.zoneGreat, { left: "42%", width: "4%" }]} />
              <View style={[styles.zone, styles.zonePerfect, { left: "46%", width: "8%" }]} />
              <View style={[styles.zone, styles.zoneGreat, { left: "54%", width: "4%" }]} />
              <View style={[styles.zone, styles.zoneGood, { left: "58%", width: "6.5%" }]} />
              <View style={[styles.zone, styles.zoneOk, { left: "64.5%", width: "6.5%" }]} />
              <View style={[styles.zone, styles.zoneMiss, { left: "71%", width: "29%" }]} />

              <View style={styles.centerMark} />

              <View style={[styles.needle, { left: `${needlePct}%` }]}>
                <View style={[styles.needleStem, { backgroundColor: teamColor }]} />
                <View style={[styles.needleHead, { backgroundColor: theme.gold }]} />
              </View>
            </View>

            <View style={styles.zoneLegend}>
              <Text style={styles.legendMiss}>{t("game.perfectPull.legendMiss")}</Text>
              <Text style={styles.legendPerfect}>{t("game.perfectPull.legendPerfect")}</Text>
              <Text style={styles.legendMiss}>{t("game.perfectPull.legendMiss")}</Text>
            </View>
          </Animated.View>

          <View style={styles.arenaHint}>
            <Image
              source={require("@/assets/images/character.png")}
              style={styles.charImg}
              resizeMode="contain"
            />
            <Animated.Text style={[styles.hitFlash, { opacity: flashOpacity }]}>
              {lastGrade
                ? t(`game.perfectPull.grade.${lastGrade}`, { points: lastHit ?? 0 })
                : ""}
            </Animated.Text>
          </View>

          <Animated.View style={{ transform: [{ scale: pulse }], width: "100%" }}>
            <Pressable
              style={[
                styles.pullBtn,
                { backgroundColor: teamColor },
                locked && styles.pullBtnLocked,
              ]}
              onPress={onPull}
              disabled={locked}
            >
              <Text style={styles.pullBtnText}>{t("common.pull")}</Text>
            </Pressable>
          </Animated.View>
          <Text style={styles.hint}>{t("game.perfectPull.playHint")}</Text>
        </View>
      ) : null}

      {phase === "result" && result ? (
        <View style={styles.resultBlock}>
          <AppIcon name="locate" size={40} color={theme.gold} />
          <Text style={styles.resultTitle}>{t("game.perfectPull.resultTitle")}</Text>
          <Text style={styles.resultPoints}>+{formatPoints(totalPoints, locale)}</Text>
          <Text style={styles.hint}>
            {t("game.perfectPull.resultDetail", {
              score: result.finalPosition ?? score,
              max: MAX_SCORE,
              rounds: result.tapCount,
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
                  {t("game.perfectPull.watchAdX2", {
                    remaining: result.x2RemainingToday,
                  })}
                </Text>
              )}
            </Pressable>
          ) : null}
          {x2Done ? (
            <Text style={styles.x2DoneText}>{t("game.perfectPull.x2Applied")}</Text>
          ) : null}
          {!result.canClaimX2 &&
          !x2Done &&
          result.pointsAwarded > 0 &&
          result.x2RemainingToday > 0 ? (
            <Text style={styles.hint}>{t("game.perfectPull.x2OddOnly")}</Text>
          ) : null}
          <Pressable style={styles.doneBtn} onPress={goBackToBattle}>
            <Text style={styles.doneBtnText}>{t("game.perfectPull.backToBattle")}</Text>
          </Pressable>
        </View>
      ) : null}

      {phase === "error" ? (
        <View style={styles.centerBlock}>
          <AppIcon name="alert-circle" size={36} color={theme.danger} />
          <Text style={styles.errorTitle}>{t("game.perfectPull.errorTitle")}</Text>
          <Text style={styles.hint}>{errorMsg}</Text>
          <Pressable style={styles.doneBtn} onPress={goBackToBattle}>
            <Text style={styles.doneBtnText}>{t("game.perfectPull.backToBattle")}</Text>
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
    gap: 10,
  },
  hudRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  hudRight: { alignItems: "flex-end" },
  roundLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.ropeSoft,
  },
  scoreVal: { fontFamily: theme.fonts.display, fontSize: 36, color: theme.gold },
  scoreLabel: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  countdownNum: {
    fontFamily: theme.fonts.display,
    fontSize: 96,
    color: theme.rope,
    letterSpacing: 2,
  },
  instruction: {
    textAlign: "center",
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.text,
  },
  gaugeWrap: { width: "100%", gap: 8 },
  gauge: {
    width: "100%",
    height: 56,
    borderRadius: 14,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
    position: "relative",
  },
  zone: { position: "absolute", top: 0, bottom: 0 },
  zoneMiss: { backgroundColor: `${theme.danger}33` },
  zoneOk: { backgroundColor: `${theme.warning}44` },
  zoneGood: { backgroundColor: `${theme.info}55` },
  zoneGreat: { backgroundColor: `${theme.success}66` },
  zonePerfect: { backgroundColor: `${theme.gold}88` },
  centerMark: {
    position: "absolute",
    left: "50%",
    marginLeft: -1,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: theme.gold,
    opacity: 0.9,
    zIndex: 2,
  },
  needle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 0,
    alignItems: "center",
    zIndex: 5,
  },
  needleStem: {
    width: 3,
    flex: 1,
    marginLeft: -1.5,
  },
  needleHead: {
    position: "absolute",
    top: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    borderWidth: 2,
    borderColor: theme.bg,
  },
  zoneLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  legendMiss: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 10,
    color: theme.textDim,
    textTransform: "uppercase",
  },
  legendPerfect: {
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    color: theme.gold,
    textTransform: "uppercase",
  },
  arenaHint: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
  },
  charImg: { width: 88, height: 88 },
  hitFlash: {
    position: "absolute",
    bottom: 0,
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.gold,
    letterSpacing: 1,
  },
  pullBtn: {
    width: "100%",
    paddingVertical: 22,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pullBtnLocked: { opacity: 0.55 },
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
