import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
  completeRapidPull,
  startRapidPull,
  type BattleSide,
  type RapidPullCompleteResponse,
} from "@/lib/api";
import { feedbackPull, feedbackTick, feedbackWin, preloadFeedback } from "@/lib/feedback";

type Phase = "booting" | "countdown" | "playing" | "submitting" | "result" | "error";

function formatPoints(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale.startsWith("tr") ? "tr-TR" : "en-US").format(n);
  } catch {
    return String(n);
  }
}

export default function RapidPullScreen() {
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
  const [timeLeftMs, setTimeLeftMs] = useState(15_000);
  const [taps, setTaps] = useState(0);
  const [result, setResult] = useState<RapidPullCompleteResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [claimingX2, setClaimingX2] = useState(false);
  const [x2Done, setX2Done] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);

  const playTokenRef = useRef<string | null>(null);
  const durationMsRef = useRef(15_000);
  const tapsRef = useRef(0);
  const submittedRef = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;

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
      const res = await completeRapidPull(
        { playToken, tapCount: tapsRef.current },
        session.token,
      );
      setResult(res);
      setTotalPoints(res.pointsAwarded);
      setPhase("result");
      feedbackWin();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("game.rapidPull.submitFailed");
      setErrorMsg(msg);
      setPhase("error");
      feedbackTick(true);
    }
  }, [ensureSession, t]);

  // Boot: start challenge session, then countdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!matchupId) {
        setErrorMsg(t("game.rapidPull.missingMatchup"));
        setPhase("error");
        return;
      }
      try {
        const session = await ensureSession();
        const started = await startRapidPull({ matchupId, side }, session.token);
        if (cancelled) return;
        playTokenRef.current = started.playToken;
        durationMsRef.current = started.durationMs;
        setTimeLeftMs(started.durationMs);
        setPhase("countdown");
        setCountdown(3);
      } catch (err) {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : "";
        setErrorMsg(raw || t("game.rapidPull.startFailed"));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchupId, side, ensureSession, t]);

  // 3-2-1 countdown
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

  // Play timer
  useEffect(() => {
    if (phase !== "playing") return;
    const started = Date.now();
    const duration = durationMsRef.current;
    const id = setInterval(() => {
      const left = Math.max(0, duration - (Date.now() - started));
      setTimeLeftMs(left);
      if (left <= 0) {
        clearInterval(id);
        finishAndSubmit();
      }
    }, 50);
    return () => clearInterval(id);
  }, [phase, finishAndSubmit]);

  const onPull = () => {
    if (phase !== "playing") return;
    tapsRef.current += 1;
    setTaps(tapsRef.current);
    feedbackPull();
    pulse.setValue(0.92);
    Animated.spring(pulse, {
      toValue: 1,
      friction: 4,
      tension: 120,
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
      Alert.alert(t("common.error"), t("game.rapidPull.x2Failed"));
    } finally {
      setClaimingX2(false);
    }
  };

  const goBackToBattle = () => {
    router.back();
  };

  const secondsLeft = Math.ceil(timeLeftMs / 1000);
  const locale = i18n.language || "en";

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Pressable onPress={goBackToBattle} hitSlop={12} style={styles.backBtn}>
          <AppIcon name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("game.challenges.rapidPull.title")}</Text>
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
              ? t("game.rapidPull.preparing")
              : t("game.rapidPull.submitting")}
          </Text>
        </View>
      ) : null}

      {phase === "countdown" ? (
        <View style={styles.centerBlock}>
          <Text style={styles.countdownNum}>{countdown > 0 ? countdown : t("game.rapidPull.go")}</Text>
          <Text style={styles.hint}>{t("game.rapidPull.countdownHint")}</Text>
        </View>
      ) : null}

      {phase === "playing" ? (
        <View style={styles.playBlock}>
          <Text
            style={[
              styles.timer,
              secondsLeft <= 3 && styles.timerUrgent,
            ]}
          >
            {secondsLeft}
          </Text>
          <Text style={styles.tapCount}>
            {t("game.rapidPull.taps", { count: taps })}
          </Text>
          <Animated.View style={{ transform: [{ scale: pulse }], width: "100%" }}>
            <Pressable
              style={[styles.pullBtn, { backgroundColor: teamColor }]}
              onPress={onPull}
            >
              <Text style={styles.pullBtnText}>{t("common.pull")}</Text>
            </Pressable>
          </Animated.View>
          <Text style={styles.hint}>{t("game.rapidPull.playHint")}</Text>
        </View>
      ) : null}

      {phase === "result" && result ? (
        <View style={styles.resultBlock}>
          <AppIcon name="flash" size={40} color={theme.gold} />
          <Text style={styles.resultTitle}>{t("game.rapidPull.resultTitle")}</Text>
          <Text style={styles.resultPoints}>
            +{formatPoints(totalPoints, locale)}
          </Text>
          <Text style={styles.hint}>
            {t("game.rapidPull.resultTaps", { count: result.tapCount })}
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
                  {t("game.rapidPull.watchAdX2", {
                    remaining: result.x2RemainingToday,
                  })}
                </Text>
              )}
            </Pressable>
          ) : null}
          {x2Done ? (
            <Text style={styles.x2DoneText}>{t("game.rapidPull.x2Applied")}</Text>
          ) : null}
          <Pressable style={styles.doneBtn} onPress={goBackToBattle}>
            <Text style={styles.doneBtnText}>{t("game.rapidPull.backToBattle")}</Text>
          </Pressable>
        </View>
      ) : null}

      {phase === "error" ? (
        <View style={styles.centerBlock}>
          <AppIcon name="alert-circle" size={36} color={theme.danger} />
          <Text style={styles.errorTitle}>{t("game.rapidPull.errorTitle")}</Text>
          <Text style={styles.hint}>{errorMsg}</Text>
          <Pressable style={styles.doneBtn} onPress={goBackToBattle}>
            <Text style={styles.doneBtnText}>{t("game.rapidPull.backToBattle")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
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
  },
  headerSpacer: { width: 40 },
  fightingFor: {
    textAlign: "center",
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    marginBottom: 12,
  },
  centerBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  playBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  countdownNum: {
    fontFamily: theme.fonts.display,
    fontSize: 96,
    color: theme.rope,
    letterSpacing: 2,
  },
  timer: {
    fontFamily: theme.fonts.display,
    fontSize: 72,
    color: theme.text,
  },
  timerUrgent: {
    color: theme.danger,
  },
  tapCount: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    color: theme.ropeSoft,
  },
  pullBtn: {
    width: "100%",
    paddingVertical: 28,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pullBtnText: {
    fontFamily: theme.fonts.display,
    fontSize: 42,
    color: theme.white,
    letterSpacing: 2,
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  resultBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  resultTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.text,
  },
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
  x2DoneText: {
    fontFamily: theme.fonts.semiBold,
    fontSize: 13,
    color: theme.success,
  },
  doneBtn: {
    marginTop: 16,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  doneBtnText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.text,
  },
  errorTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.text,
  },
});
