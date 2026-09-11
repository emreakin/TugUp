import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SubtleBannerSlot } from "@/components/HomeBannerAd";
import { AppIcon, TrophyIcon } from "@/components/AppIcon";
import { ArenaAtmosphere } from "@/components/ArenaAtmosphere";
import { IconSlot } from "@/components/IconSlot";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, getApiHeaders, getApiUrl } from "@/lib/api";
import {
  feedbackLose,
  feedbackPull,
  feedbackTick,
  feedbackWin,
  preloadFeedback,
} from "@/lib/feedback";
import { FRIENDS_ENABLED } from "@/lib/features";

// ─── Constants ────────────────────────────────────────────────────

const CHAR_WIDTH = 100;
const ROPE_PAD = 4;
const WINDOW_WIDTH = Dimensions.get("window").width;
const MAX_TRANSLATION = WINDOW_WIDTH / 2 - ROPE_PAD - CHAR_WIDTH / 2;

const CHARACTER_IMG = require("@/assets/images/character.png");
const ROPE_IMG = require("@/assets/images/rope.png");

// ─── Types ─────────────────────────────────────────────────────────

type Phase = "mode_select" | "name_input" | "connecting" | "waiting" | "countdown" | "playing" | "ended";
type MatchMode = "random" | "invite";

interface MatchupInfo {
  id: string;
  leftTeam: string;
  rightTeam: string;
  leftColor: string;
  rightColor: string;
  emoji: string;
  winThreshold: number;
}

const FIXED_MATCHUP_BASE = {
  id: "fixed",
  leftColor: "#ef4444",
  rightColor: "#3b82f6",
  emoji: "⚔️",
  winThreshold: 10,
} as const;

function createFixedMatchup(t: (key: string) => string): MatchupInfo {
  return {
    ...FIXED_MATCHUP_BASE,
    leftTeam: t("oneVsOne.teamA"),
    rightTeam: t("oneVsOne.teamB"),
  };
}

// ─── Character Component ──────────────────────────────────────────

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
      <View style={[styles.charGlow, { backgroundColor: color + "33", shadowColor: color }]} />
      <Image
        source={CHARACTER_IMG}
        style={[styles.charImage, flipped && { transform: [{ scaleX: -1 }] }]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

// ─── Onboarding ────────────────────────────────────────────────────

const ONBOARDING_1V1_KEY = "@tugup_onboarding_1v1_done";

const ONBOARDING_1V1_STEP_KEYS = [
  { title: "oneVsOne.onboarding.step1Title", text: "oneVsOne.onboarding.step1Text" },
  { title: "oneVsOne.onboarding.step2Title", text: "oneVsOne.onboarding.step2Text" },
  { title: "oneVsOne.onboarding.step3Title", text: "oneVsOne.onboarding.step3Text" },
  { title: "oneVsOne.onboarding.step4Title", text: "oneVsOne.onboarding.step4Text" },
] as const;

// ─── Main Screen ─────────────────────────────────────────────────────

export default function OneVsOneScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const onboardingSteps = ONBOARDING_1V1_STEP_KEYS.map((step) => ({
    title: t(step.title),
    text: t(step.text),
  }));
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { token, ensureSession, playerToken: authPlayerToken, user, updateDisplayName } = useAuth();
  const params = useLocalSearchParams<{
    joinRoomId?: string;
    joinSide?: string;
    joinStatus?: string;
    joinOpponent?: string;
    joinPlayerToken?: string;
  }>();

  // ── Phase & matchmaking state ───────────────────────────────────────
  const [phase, setPhase] = useState<Phase>(FRIENDS_ENABLED ? "mode_select" : "name_input");
  const [matchMode, setMatchMode] = useState<MatchMode>("random");
  const [gameInviteShare, setGameInviteShare] = useState<string | null>(null);
  const [matchup, setMatchup] = useState<MatchupInfo | null>(null);
  const [mySide, setMySide] = useState<"left" | "right">("left");
  const [countdownNum, setCountdownNum] = useState(5);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [opponentName, setOpponentName] = useState<string | null>(null);

  // Prefill from saved profile name
  useEffect(() => {
    if (user?.displayName && !playerName) {
      setPlayerName(user.displayName);
    }
  }, [user?.displayName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Onboarding state ─────────────────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // ── Onboarding check ────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_1V1_KEY)
      .then((done) => {
        if (!done) setShowOnboarding(true);
      })
      .catch(() => {});
  }, []);

  const handleOnboardingNext = () => {
    if (onboardingStep < onboardingSteps.length - 1) {
      setOnboardingStep(onboardingStep + 1);
    } else {
      setShowOnboarding(false);
      AsyncStorage.setItem(ONBOARDING_1V1_KEY, "done").catch(() => {});
    }
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_1V1_KEY, "done").catch(() => {});
  };

  // ── Game state ─────────────────────────────────────────────
  const [offset, setOffset] = useState(0);
  const [leftPulls, setLeftPulls] = useState(0);
  const [rightPulls, setRightPulls] = useState(0);
  const [winner, setWinner] = useState<"left" | "right" | null>(null);

  // ── API tokens & polling ──────────────────────────────────────────
  const roomIdRef = useRef<string | null>(null);
  const playerTokenRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<Phase>("mode_select");
  // Always-current ref so the interval never calls a stale closure
  const pollStateRef = useRef<() => Promise<void>>(async () => {});

  // ── Animations ────────────────────────────────────────────────
  const leftCharAnim = useRef(new Animated.Value(0)).current;
  const rightCharAnim = useRef(new Animated.Value(0)).current;
  const leftPulseAnim = useRef(new Animated.Value(1)).current;
  const rightPulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0.5)).current;
  const leftCharShift = useRef(new Animated.Value(0)).current;
  const rightCharShift = useRef(new Animated.Value(0)).current;
  const ropeWrapWidthAnim = useRef(
    new Animated.Value(WINDOW_WIDTH - 2 * CHAR_WIDTH - 2 * ROPE_PAD)
  ).current;

  // ── Visuals update ─────────────────────────────────────────────
  const updateVisuals = useCallback(
    (newOffset: number, threshold: number) => {
      const progress = (newOffset + threshold) / (threshold * 2);
      progressAnim.setValue(Math.max(0, Math.min(1, progress)));

      // The LOSER gets dragged toward the center line
      // offset > 0 → right winning → left char pulled toward center (positive shift)
      // offset < 0 → left winning → right char pulled toward center (negative shift)
      const leftTarget = newOffset > 0 ? (newOffset / threshold) * MAX_TRANSLATION : 0;
      const rightTarget = newOffset < 0 ? (newOffset / threshold) * MAX_TRANSLATION : 0;

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
    },
    []
  );

  const pulseButton = useCallback((side: "left" | "right") => {
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
  }, []);

  const resetAnimations = useCallback(() => {
    leftCharShift.setValue(0);
    rightCharShift.setValue(0);
    leftCharAnim.setValue(0);
    rightCharAnim.setValue(0);
    progressAnim.setValue(0.5);
    ropeWrapWidthAnim.setValue(WINDOW_WIDTH - 2 * CHAR_WIDTH - 2 * ROPE_PAD);
  }, []);

  // ── Poll state from server ──────────────────────────────────────────
  const pollState = useCallback(async () => {
    const roomId = roomIdRef.current;
    const token = playerTokenRef.current;
    if (!roomId || !token) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/game/state/${roomId}?playerToken=${token}`, {
        headers: getApiHeaders({}, { json: false }),
      });
      if (res.status === 404) {
        // Room deleted (no opponent was present) — quietly go back
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        router.back();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();

      // Update matchup if not set yet
      if (data.matchup && !matchup) {
        setMatchup(data.matchup);
      }

      // Update opponent
      if (data.opponentName && !opponentName) {
        setOpponentName(data.opponentName);
        // Opponent just joined → countdown
        setPhase("countdown");
        setCountdownNum(5);
      }

      // Countdown handling — no haptic here, local timer handles it
      if (data.status === "countdown" && data.countdown !== undefined) {
        setCountdownNum(data.countdown);
      }

      // Transition to playing
      if (data.status === "playing" && phase !== "playing" && phase !== "ended") {
        setPhase("playing");
      }

      // Update game state
      if (data.offset !== undefined) {
        setOffset(data.offset);
        setLeftPulls(data.leftPulls ?? 0);
        setRightPulls(data.rightPulls ?? 0);
        updateVisuals(data.offset, (matchup?.winThreshold ?? 100));
      }

      // Game ended
      if (data.winner && phase !== "ended") {
        setWinner(data.winner);
        setPhase("ended");
      }

      // Opponent left while waiting/countdown
      if ((phase === "waiting" || phase === "countdown") && data.status === "waiting" && !data.opponentName) {
        setOpponentName(null);
        setPhase("waiting");
      }
    } catch {
      // Ignore polling errors
    }
  }, [matchup, phase, opponentName, updateVisuals]);

  // ── Keep pollStateRef current so the interval never calls a stale closure ──
  useEffect(() => {
    pollStateRef.current = pollState;
  }, [pollState]);

  // ── Join from game invite deep link ───────────────────────────────
  useEffect(() => {
    if (!FRIENDS_ENABLED) return;
    const roomId = params.joinRoomId;
    const playerToken = params.joinPlayerToken;
    if (!roomId || !playerToken) return;

    roomIdRef.current = roomId;
    playerTokenRef.current = playerToken;
    AsyncStorage.setItem("player_token", playerToken).catch(() => {});

    const side = params.joinSide === "left" ? "left" : "right";
    setMySide(side);
    setMatchup(createFixedMatchup(t));
    if (params.joinOpponent) setOpponentName(params.joinOpponent);

    const status = params.joinStatus ?? "waiting";
    if (status === "countdown") {
      setPhase("countdown");
      setCountdownNum(5);
    } else if (status === "playing") {
      setPhase("playing");
    } else {
      setPhase("waiting");
    }

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => { pollStateRef.current(); }, 500);
  }, [params.joinRoomId, params.joinPlayerToken, params.joinSide, params.joinStatus, params.joinOpponent, t]);

  // ── Connect / Join ──────────────────────────────────────────────
  const connect = useCallback(async () => {
    setPhase("connecting");
    setErrorMsg(null);
    setOffset(0);
    setLeftPulls(0);
    setRightPulls(0);
    setWinner(null);
    setOpponentName(null);
    setGameInviteShare(null);
    resetAnimations();

    try {
      const session = await ensureSession(playerName || t("common.player"));
      const trimmedName = (playerName || t("common.player")).trim().slice(0, 24);
      if (trimmedName && trimmedName !== session.user.displayName) {
        await updateDisplayName(trimmedName).catch(() => {});
      }
      const tokenToUse = session.playerToken ?? authPlayerToken;
      let token = tokenToUse ?? (await AsyncStorage.getItem("player_token"));

      if (FRIENDS_ENABLED && matchMode === "invite") {
        const data = await apiFetch<{
          roomId: string;
          side: "left" | "right";
          status: string;
          opponentName: string | null;
          playerToken: string;
          shareMessage: string;
        }>("/api/game/create-invite", {
          method: "POST",
          token: session.token,
          body: JSON.stringify({ name: playerName || t("common.player") }),
        });

        roomIdRef.current = data.roomId;
        playerTokenRef.current = data.playerToken;
        await AsyncStorage.setItem("player_token", data.playerToken);
        setGameInviteShare(data.shareMessage);

        setMySide(data.side);
        setMatchup(createFixedMatchup(t));
        if (data.opponentName) setOpponentName(data.opponentName);
        setPhase("waiting");
      } else {
        const res = await fetch(`${getApiUrl()}/api/game/join`, {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({ name: playerName || t("common.player"), playerToken: token }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setErrorMsg(err.message ?? t("oneVsOne.serverError"));
          setPhase("name_input");
          return;
        }

        const data = await res.json();
        roomIdRef.current = data.roomId;
        playerTokenRef.current = data.playerToken;
        await AsyncStorage.setItem("player_token", data.playerToken);

        setMySide(data.side);
        if (data.matchup) setMatchup(data.matchup);
        if (data.opponentName) setOpponentName(data.opponentName);

        if (data.status === "waiting") {
          setPhase("waiting");
        } else if (data.status === "countdown") {
          setPhase("countdown");
          setCountdownNum(5);
        } else if (data.status === "playing") {
          setPhase("playing");
        } else if (data.status === "ended") {
          setPhase("ended");
        }
      }

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(() => { pollStateRef.current(); }, 500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("oneVsOne.connectionFailed"));
      setPhase("name_input");
    }
  }, [playerName, resetAnimations, matchMode, ensureSession, authPlayerToken, updateDisplayName, t]);

  // ── Play again — clear token so server creates a brand-new room ───
  const playAgain = useCallback(async () => {
    await AsyncStorage.removeItem("player_token");
    playerTokenRef.current = null;
    roomIdRef.current = null;
    connect();
  }, [connect]);

  // ── Sync phaseRef ─────────────────────────────────────────────
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ── Leave room on app background / unmount ────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background") {
        // App went to background — leave room
        const roomId = roomIdRef.current;
        const token = playerTokenRef.current;
        if (roomId && token) {
          fetch(`${getApiUrl()}/api/game/leave/${roomId}`, {
            method: "POST",
            headers: getApiHeaders(),
            body: JSON.stringify({ playerToken: token }),
          }).catch(() => {});
        }
      }
    });

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      sub.remove();
      // Leave room when unmounting
      const roomId = roomIdRef.current;
      const token = playerTokenRef.current;
      if (roomId && token) {
        fetch(`${getApiUrl()}/api/game/leave/${roomId}`, {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({ playerToken: token }),
        }).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    preloadFeedback();
  }, []);

  // ── Handle pull ───────────────────────────────────────────────
  const handlePull = useCallback(async () => {
    if (phase !== "playing") return;
    feedbackPull();
    pulseButton(mySide);

    const roomId = roomIdRef.current;
    const token = playerTokenRef.current;
    if (!roomId || !token) return;

    try {
      await fetch(`${getApiUrl()}/api/game/pull/${roomId}`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ playerToken: token, side: mySide }),
      });
      // Immediate poll after pull
      pollState();
    } catch {
      // Ignore
    }
  }, [phase, mySide, pulseButton, pollState]);

  // ── Derived ───────────────────────────────────────────────────
  const threshold = matchup?.winThreshold ?? 100;
  const leftRemaining = Math.max(0, threshold + offset);
  const rightRemaining = Math.max(0, threshold - offset);

  const leftColor = matchup?.leftColor ?? "#ef4444";
  const rightColor = matchup?.rightColor ?? "#3b82f6";
  const myColor = mySide === "left" ? leftColor : rightColor;
  const opponentColor = mySide === "left" ? rightColor : leftColor;
  const myPulls = mySide === "left" ? leftPulls : rightPulls;
  const opponentPulls = mySide === "left" ? rightPulls : leftPulls;

  const isWinner = winner === mySide;

  // ── Countdown timer (local) ───────────────────────────────────────
  useEffect(() => {
    if (phase !== "countdown") return;
    let remaining = countdownNum;
    feedbackTick(remaining <= 3);
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        setCountdownNum(0);
        setPhase("playing");
        return;
      }
      setCountdownNum(remaining);
      feedbackTick(remaining <= 3);
    }, 1000);
    return () => clearInterval(timer);
    // Only restart when entering countdown; capture starting number once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Win / lose feedback when match ends
  useEffect(() => {
    if (phase !== "ended" || !winner) return;
    if (winner === mySide) feedbackWin();
    else feedbackLose();
  }, [phase, winner, mySide]);

  // ── Mode select screen ─────────────────────────────────────────
  if (phase === "mode_select") {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← {t("common.mainMenu")}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t("oneVsOne.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.nameInputContent}>
          <IconSlot name="people-outline" size={32} color={theme.textMuted} style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 8 }} />
          <Text style={styles.nameInputTitle}>{t("oneVsOne.modeSelectTitle")}</Text>
          <Text style={styles.nameInputSubtitle}>{t("oneVsOne.modeSelectSubtitle")}</Text>

          <Pressable
            style={({ pressed }) => [styles.modeCard, pressed && styles.modeCardPressed]}
            onPress={() => { setMatchMode("random"); setPhase("name_input"); }}
          >
            <IconSlot name="dice-outline" size={22} color="#3b82f6" backgroundColor="#3b82f622" />
            <View style={styles.modeCardText}>
              <Text style={styles.modeCardTitle}>{t("oneVsOne.randomMatchTitle")}</Text>
              <Text style={styles.modeCardDesc}>{t("oneVsOne.randomMatchDesc")}</Text>
            </View>
          </Pressable>

          {FRIENDS_ENABLED ? (
            <Pressable
              style={({ pressed }) => [styles.modeCard, styles.modeCardInvite, pressed && styles.modeCardPressed]}
              onPress={() => { setMatchMode("invite"); setPhase("name_input"); }}
            >
              <IconSlot name="link-outline" size={22} color="#10b981" backgroundColor="#10b98122" />
              <View style={styles.modeCardText}>
                <Text style={styles.modeCardTitle}>{t("oneVsOne.inviteFriendTitle")}</Text>
                <Text style={styles.modeCardDesc}>{t("oneVsOne.inviteFriendDesc")}</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
        <SubtleBannerSlot />
      </View>
    );
  }

  // ── Name input screen ────────────────────────────────────────
  if (phase === "name_input") {
    return (
      <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <Pressable
            onPress={() => (FRIENDS_ENABLED ? setPhase("mode_select") : router.back())}
            style={styles.backBtn}
          >
            <Text style={styles.backText}>← {t("common.back")}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t("oneVsOne.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.nameInputContent}>
          <IconSlot name="game-controller-outline" size={32} color={theme.textMuted} style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 8 }} />
          <Text style={styles.nameInputTitle}>{t("oneVsOne.title")}</Text>
          <Text style={styles.nameInputSubtitle}>
            {matchMode === "invite"
              ? t("oneVsOne.nameSubtitleInvite")
              : t("oneVsOne.nameSubtitleRandom")}
          </Text>
          <TextInput
            style={styles.nameInputField}
            placeholder={t("common.usernamePlaceholder")}
            placeholderTextColor={theme.textDim}
            value={playerName}
            onChangeText={setPlayerName}
            maxLength={20}
            autoCapitalize="words"
            autoFocus
          />
          <Pressable
            style={({ pressed }) => [
              styles.nameInputBtn,
              pressed && styles.nameInputBtnPressed,
            ]}
            onPress={connect}
            disabled={!playerName.trim()}
          >
            <Text style={styles.nameInputBtnText}>
              {matchMode === "invite" ? t("oneVsOne.createInvite") : t("oneVsOne.start")}
            </Text>
          </Pressable>
        </View>

        {/* 1v1 Onboarding Modal */}
        <Modal visible={showOnboarding} transparent animationType="fade">
          <View style={styles.onboardingOverlay}>
            <View style={styles.onboardingCard}>
              <Text style={styles.onboardingStepCount}>
                {onboardingStep + 1} / {onboardingSteps.length}
              </Text>
              <Text style={styles.onboardingTitle}>{onboardingSteps[onboardingStep].title}</Text>
              <Text style={styles.onboardingText}>{onboardingSteps[onboardingStep].text}</Text>

              <View style={styles.onboardingDots}>
                {onboardingSteps.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.onboardingDot,
                      i === onboardingStep && styles.onboardingDotActive,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.onboardingButtons}>
                {onboardingStep < onboardingSteps.length - 1 ? (
                  <>
                    <Pressable
                      style={styles.onboardingBtnSecondary}
                      onPress={handleOnboardingSkip}
                    >
                      <Text style={styles.onboardingBtnSecondaryText}>{t("common.onboarding.skip")}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.onboardingBtnPrimary}
                      onPress={handleOnboardingNext}
                    >
                      <Text style={styles.onboardingBtnPrimaryText}>{t("common.onboarding.next")}</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    style={styles.onboardingBtnPrimary}
                    onPress={handleOnboardingNext}
                  >
                    <Text style={styles.onboardingBtnPrimaryText}>{t("common.onboarding.start")}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Connecting / Error screen ──────────────────────────────────────────
  if (phase === "connecting") {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: topInset }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <Pressable onPress={() => { const rid = roomIdRef.current; const tok = playerTokenRef.current; if (rid && tok) { fetch(`${getApiUrl()}/api/game/leave/${rid}`, { method: "POST", headers: getApiHeaders(), body: JSON.stringify({ playerToken: tok }) }).catch(() => {}); } router.back(); }} style={styles.backBtn}>
            <Text style={styles.backText}>← {t("common.mainMenu")}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t("oneVsOne.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>
        {errorMsg ? (
          <>
            <AppIcon name="warning-outline" size={48} color="#f59e0b" style={{ marginBottom: 12 }} />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable style={styles.retryBtn} onPress={connect}>
              <Text style={styles.retryBtnText}>{t("oneVsOne.retry")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={theme.ember} size="large" />
            <Text style={styles.connectingText}>{t("oneVsOne.connecting")}</Text>
          </>
        )}
      </View>
    );
  }

  // ── Waiting / Countdown screen ────────────────────────────────────
  if (phase === "waiting" || phase === "countdown") {
    return (
      <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); const rid = roomIdRef.current; const tok = playerTokenRef.current; if (rid && tok) { fetch(`${getApiUrl()}/api/game/leave/${rid}`, { method: "POST", headers: getApiHeaders(), body: JSON.stringify({ playerToken: tok }) }).catch(() => {}); } router.back(); }} style={styles.backBtn}>
            <Text style={styles.backText}>← {t("common.mainMenu")}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t("oneVsOne.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Matchup badge */}
        {matchup && (
          <View style={styles.matchupBadge}>
            <IconSlot name="git-compare-outline" size={18} color={theme.textMuted} backgroundColor={theme.surface} />
            <Text style={[styles.matchupTeam, { color: leftColor }]}>{matchup.leftTeam}</Text>
            <Text style={styles.matchupVs}>{t("common.vs")}</Text>
            <Text style={[styles.matchupTeam, { color: rightColor }]}>{matchup.rightTeam}</Text>
          </View>
        )}

        {/* Arena */}
        <View style={styles.waitingArena}>
          {/* My side */}
          <View style={styles.waitingSlot}>
            <View style={[styles.avatarGlow, { backgroundColor: myColor + "33", shadowColor: myColor }]} />
            <Image source={CHARACTER_IMG} style={[styles.waitingAvatar, mySide === "right" && { transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
            <Text style={[styles.waitingSlotLabel, { color: myColor }]}>{playerName || t("common.you")}</Text>
            <Text style={[styles.waitingReady, { color: myColor }]}>{t("common.ready")}</Text>
          </View>

          {/* VS divider */}
          <View style={styles.waitingVsDivider}>
            <View style={[styles.vsDividerLine, { backgroundColor: theme.surface }]} />
            <View style={[styles.vsCircle, { borderColor: theme.border }]}>
              <Text style={styles.vsText}>VS</Text>
            </View>
            <View style={[styles.vsDividerLine, { backgroundColor: theme.surface }]} />
          </View>

          {/* Opponent side */}
          <View style={styles.waitingSlot}>
            {phase === "waiting" ? (
              <>
                <View style={[styles.avatarGlow, { backgroundColor: theme.border + "55" }]} />
                <View style={styles.waitingAvatarPlaceholder}>
                  <Text style={styles.waitingAvatarQuestion}>?</Text>
                </View>
                <Text style={[styles.waitingSlotLabel, { color: opponentColor }]}>{opponentName ?? t("common.opponent")}</Text>
                <View style={styles.waitingOpponentRow}>
                  <ActivityIndicator color={theme.textDim} size="small" />
                  <Text style={styles.waitingForText}>{t("oneVsOne.waitingForOpponent")}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.avatarGlow, { backgroundColor: opponentColor + "33", shadowColor: opponentColor }]} />
                <Image source={CHARACTER_IMG} style={[styles.waitingAvatar, mySide === "left" && { transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
                <Text style={[styles.waitingSlotLabel, { color: opponentColor }]}>{opponentName ?? t("common.opponent")}</Text>
                <Text style={[styles.waitingReady, { color: opponentColor }]}>{t("common.ready")}</Text>
              </>
            )}
          </View>
        </View>

        {/* Countdown overlay */}
        {phase === "countdown" && (
          <View style={styles.countdownContainer}>
            <Text style={styles.countdownNumber}>{countdownNum}</Text>
            <Text style={styles.countdownLabel}>{t("oneVsOne.starting")}</Text>
          </View>
        )}

        {phase === "waiting" && (
          <View style={styles.waitingFooter}>
            {gameInviteShare ? (
              <Pressable
                style={styles.shareInviteBtn}
                onPress={() => Share.share({ message: gameInviteShare })}
              >
                <Text style={styles.shareInviteBtnText}>{t("oneVsOne.shareInviteLink")}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.waitingFooterText}>
              {gameInviteShare
                ? t("oneVsOne.waitingInviteFooter")
                : t("oneVsOne.waitingMatchFooter")}
            </Text>
          </View>
        )}
        {phase === "waiting" ? <SubtleBannerSlot /> : null}
      </View>
    );
  }

  // ── Game screen (playing / ended) ────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); const rid = roomIdRef.current; const tok = playerTokenRef.current; if (rid && tok) { fetch(`${getApiUrl()}/api/game/leave/${rid}`, { method: "POST", headers: getApiHeaders(), body: JSON.stringify({ playerToken: tok }) }).catch(() => {}); } router.back(); }} style={styles.backBtn}>
          <Text style={styles.backText}>← {t("common.mainMenu")}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>1v1</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Player names */}
      <View style={styles.teamRow}>
        <Text style={[styles.teamLabel, { color: leftColor }]} numberOfLines={1}>
          {mySide === "left" ? playerName : opponentName ?? t("common.opponent")}
        </Text>
        <Text style={styles.vsLabel}>{t("common.vs")}</Text>
        <Text style={[styles.teamLabel, { color: rightColor }]} numberOfLines={1}>
          {mySide === "right" ? playerName : opponentName ?? t("common.opponent")}
        </Text>
      </View>

      {/* Rope area */}
      <View style={styles.ropeArea}>
        <ArenaAtmosphere leftColor={leftColor} rightColor={rightColor} />
        <Animated.View style={[styles.charSlot, { transform: [{ translateX: leftCharShift }] }]}>
          <Character color={leftColor} bounceAnim={leftCharAnim} />
        </Animated.View>

        <View
          style={styles.ropeWrap}
          onLayout={(e) => ropeWrapWidthAnim.setValue(e.nativeEvent.layout.width)}
        >
          <Animated.View
            style={[
              styles.ropeImgWrap,
              {
                left: leftCharShift,
                width: Animated.add(
                  Animated.add(ropeWrapWidthAnim, Animated.multiply(leftCharShift, -1)),
                  rightCharShift
                ),
              },
            ]}
          >
            <Image source={ROPE_IMG} resizeMode="stretch" style={styles.ropeImg} />
          </Animated.View>
        </View>

        <Animated.View style={[styles.charSlot, { transform: [{ translateX: rightCharShift }] }]}>
          <Character color={rightColor} flipped bounceAnim={rightCharAnim} />
        </Animated.View>

        <View style={styles.centerLineGlow} pointerEvents="none" />
        <View style={styles.centerLine} pointerEvents="none" />

        {/* Progress bar */}
        <View style={styles.progressWrap} pointerEvents="none">
          <View style={styles.progressCard}>
            <View style={[styles.progressBadge, { backgroundColor: leftColor + "22", borderColor: leftColor }]}>
              <Text style={[styles.progressBadgeNum, { color: leftColor }]}>{leftRemaining}</Text>
              <Text style={[styles.progressBadgeLabel, { color: leftColor }]}>{t("oneVsOne.remaining")}</Text>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFillLeft, { backgroundColor: leftColor, width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["100%", "0%"] }) }]} />
              <Animated.View style={[styles.progressFillRight, { backgroundColor: rightColor, width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
              <Animated.View style={[styles.progressMarker, { left: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
            </View>
            <View style={[styles.progressBadge, { backgroundColor: rightColor + "22", borderColor: rightColor }]}>
              <Text style={[styles.progressBadgeNum, { color: rightColor }]}>{rightRemaining}</Text>
              <Text style={[styles.progressBadgeLabel, { color: rightColor }]}>{t("oneVsOne.remaining")}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Pull buttons */}
      <View style={{ paddingBottom: bottomInset + 16 }}>
        <View style={styles.buttonsRow}>
          {/* Left team button */}
          <Animated.View style={[styles.buttonWrap, { transform: [{ scale: leftPulseAnim }] }]}>
            <Pressable
              style={[
                styles.pullBtn,
                { backgroundColor: leftColor + "22", borderColor: leftColor },
                (phase !== "playing" || mySide !== "left") && styles.pullBtnDisabled,
              ]}
              onPress={handlePull}
              disabled={phase !== "playing" || mySide !== "left"}
            >
              <Text style={[styles.pullBtnText, { color: leftColor }]}>
                {t("oneVsOne.pullLeft")}
              </Text>
            </Pressable>
          </Animated.View>

          {/* Right team button */}
          <Animated.View style={[styles.buttonWrap, { transform: [{ scale: rightPulseAnim }] }]}>
            <Pressable
              style={[
                styles.pullBtn,
                { backgroundColor: rightColor + "22", borderColor: rightColor },
                (phase !== "playing" || mySide !== "right") && styles.pullBtnDisabled,
              ]}
              onPress={handlePull}
              disabled={phase !== "playing" || mySide !== "right"}
            >
              <Text style={[styles.pullBtnText, { color: rightColor }]}>
                {t("oneVsOne.pullRight")}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      {/* Win modal */}
      <Modal visible={phase === "ended"} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalGlow, { backgroundColor: (isWinner ? myColor : opponentColor) + "33" }]} />
            <View style={{ marginBottom: 8 }}>
              <TrophyIcon size={56} color={isWinner ? myColor : theme.textDim} />
            </View>
            <Text style={[styles.modalTitle, { color: isWinner ? myColor : opponentColor }]}>
              {isWinner ? t("oneVsOne.youWon") : t("oneVsOne.youLost")}
            </Text>
            <Text style={styles.modalSubtitle}>
              {isWinner
                ? t("oneVsOne.winMessage", {
                    name: playerName || t("common.player"),
                    opponent: opponentName ?? t("common.opponent"),
                  })
                : t("oneVsOne.loseMessage", {
                    opponent: opponentName ?? t("common.opponent"),
                  })}
            </Text>
            <Text style={styles.modalStats}>
              {"\n"}
            </Text>
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalBtnMain} onPress={playAgain}>
                <Text style={styles.modalBtnMainText}>{t("oneVsOne.playAgain")}</Text>
              </Pressable>
              <Pressable style={styles.modalBtnSec} onPress={() => router.back()}>
                <Text style={styles.modalBtnSecText}>{t("common.mainMenu")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { alignItems: "center", justifyContent: "center", gap: 20 },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { padding: 10 },
  headerTitle: { color: theme.text, fontSize: 18, fontFamily: theme.fonts.bold, flex: 1, textAlign: "center" },
  headerSpacer: { width: 70 },
  backText: { color: theme.textMuted, fontSize: 15, fontFamily: theme.fonts.semiBold },

  nameInputContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  nameInputEmoji: { fontSize: 56 },
  nameInputTitle: { color: theme.text, fontSize: 28, fontWeight: "900", letterSpacing: 1 },
  nameInputSubtitle: { color: theme.textDim, fontSize: 14, fontWeight: "600" },
  nameInputField: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, width: "100%", color: theme.text, fontSize: 18, fontWeight: "600", borderWidth: 1, borderColor: theme.border },
  nameInputBtn: { backgroundColor: theme.ember, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32, width: "100%", alignItems: "center" },
  nameInputBtnPressed: { opacity: 0.8 },
  nameInputBtnText: { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 1 },

  modeCard: {
    width: "100%",
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modeCardInvite: { borderColor: "#3b82f6" },
  modeCardPressed: { opacity: 0.85 },
  modeCardEmoji: { fontSize: 32, width: 40, textAlign: "center" },
  modeCardText: { flex: 1 },
  modeCardTitle: { color: theme.text, fontFamily: theme.fonts.bold, fontSize: 17 },
  modeCardDesc: { color: theme.textDim, fontFamily: theme.fonts.regular, fontSize: 13, marginTop: 4 },

  shareInviteBtn: {
    backgroundColor: theme.modes.oneVsOne,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 12,
    width: "90%",
    alignItems: "center",
  },
  shareInviteBtnText: { color: "#fff", fontFamily: theme.fonts.bold, fontSize: 15 },

  errorEmoji: { fontSize: 48 },
  errorText: { color: theme.ember, fontSize: 16, fontWeight: "600", textAlign: "center" },
  retryBtn: { backgroundColor: theme.ember, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  retryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  connectingText: { color: theme.textDim, fontSize: 16, fontWeight: "600", marginTop: 12 },

  matchupBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  matchupEmoji: { fontSize: 24 },
  matchupTeam: { fontSize: 16, fontWeight: "800" },
  matchupVs: { color: theme.textDim, fontSize: 14, fontWeight: "700" },

  waitingArena: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, gap: 12, flex: 1 },
  waitingSlot: { flex: 1, alignItems: "center", gap: 8 },
  avatarGlow: { width: 80, height: 80, borderRadius: 40, position: "absolute", opacity: 0.3 },
  waitingAvatar: { width: 80, height: 80 },
  waitingAvatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.border, alignItems: "center", justifyContent: "center" },
  waitingAvatarQuestion: { color: theme.textDim, fontSize: 32, fontWeight: "800" },
  waitingSlotLabel: { fontSize: 14, fontWeight: "700" },
  waitingReady: { fontSize: 12, fontWeight: "700" },
  waitingOpponentRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  waitingForText: { color: theme.textDim, fontSize: 12, fontWeight: "600" },
  waitingVsDivider: { alignItems: "center", gap: 8 },
  vsDividerLine: { width: 2, height: 40, borderRadius: 1 },
  vsCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  vsText: { color: theme.textDim, fontSize: 12, fontWeight: "800" },
  waitingFooter: { paddingVertical: 20, alignItems: "center" },
  waitingFooterText: { color: theme.textDim, fontSize: 14, fontWeight: "600" },

  countdownContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15,23,42,0.85)", alignItems: "center", justifyContent: "center", zIndex: 100 },
  countdownNumber: {
    color: theme.ember,
    fontSize: 120,
    fontFamily: theme.fonts.display,
    letterSpacing: 2,
  },
  countdownLabel: {
    color: theme.text,
    fontSize: 20,
    fontFamily: theme.fonts.bold,
    letterSpacing: 4,
  },

  teamRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginTop: 8 },
  teamLabel: { fontSize: 17, fontFamily: theme.fonts.bold, flex: 1, textAlign: "center", letterSpacing: 0.5 },
  vsLabel: { color: theme.textDim, fontSize: 13, fontFamily: theme.fonts.semiBold, marginHorizontal: 10 },

  clickRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 40, marginTop: 6, marginBottom: 4 },
  clickCount: { fontSize: 20, fontFamily: theme.fonts.bold },

  ropeArea: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: ROPE_PAD, position: "relative", overflow: "hidden" },
  charSlot: { width: CHAR_WIDTH, alignItems: "center", justifyContent: "center", zIndex: 2 },
  charWrap: { alignItems: "center" },
  charGlow: { width: 100, height: 100, borderRadius: 50, position: "absolute", opacity: 0.3 },
  charImage: { width: 100, height: 100 },
  ropeWrap: { flex: 1, height: 140, overflow: "hidden", zIndex: 1 },
  ropeImgWrap: { position: "absolute", top: 64, height: 4 },
  ropeImg: { width: "100%", height: 4 },
  centerLineGlow: {
    position: "absolute",
    left: "50%",
    top: "22%",
    bottom: "26%",
    width: 10,
    marginLeft: -5,
    backgroundColor: "rgba(212,160,90,0.14)",
    zIndex: 9,
    borderRadius: 5,
  },
  centerLine: {
    position: "absolute",
    top: "18%",
    bottom: "22%",
    left: "50%",
    width: 3,
    backgroundColor: "rgba(242,235,227,0.55)",
    borderRadius: 1.5,
    marginLeft: -1.5,
    shadowColor: theme.rope,
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },

  progressWrap: { position: "absolute", top: "50%", marginTop: 110, left: 16, right: 16, alignItems: "center", zIndex: 3 },
  progressCard: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(15,23,42,0.85)", borderRadius: 22, paddingVertical: 10, paddingHorizontal: 12, gap: 12, width: "100%", maxWidth: 360, borderWidth: 1, borderColor: "rgba(148,163,184,0.2)", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  progressBadge: { minWidth: 56, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, alignItems: "center" },
  progressBadgeNum: { fontSize: 20, fontWeight: "900", lineHeight: 24 },
  progressBadgeLabel: { fontSize: 9, fontWeight: "600", letterSpacing: 1.2, opacity: 0.9 },
  progressTrack: { flex: 1, height: 10, backgroundColor: "rgba(148,163,184,0.15)", borderRadius: 5, overflow: "visible", position: "relative" },
  progressFillLeft: { position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 5, opacity: 0.85 },
  progressFillRight: { position: "absolute", top: 0, bottom: 0, right: 0, borderRadius: 5, opacity: 0.85 },
  progressMarker: { position: "absolute", top: -3, bottom: -3, width: 4, backgroundColor: theme.text, borderRadius: 2, zIndex: 5 },

  buttonsRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  buttonWrap: { flex: 1 },
  pullBtn: { borderRadius: 18, paddingVertical: 22, alignItems: "center", borderWidth: 2 },
  pullBtnDisabled: { opacity: 0.4 },
  pullBtnText: { fontSize: 18, fontWeight: "900", letterSpacing: 1 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  modalCard: { backgroundColor: theme.surface, borderRadius: 24, padding: 28, margin: 24, alignItems: "center", width: "90%", maxWidth: 360, position: "relative", overflow: "hidden" },
  modalGlow: { position: "absolute", top: -60, width: 200, height: 200, borderRadius: 100, alignSelf: "center" },
  modalEmoji: { fontSize: 56, marginBottom: 8 },
  modalTitle: { fontSize: 28, fontWeight: "900", letterSpacing: 1, marginBottom: 8 },
  modalSubtitle: { color: theme.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center", marginBottom: 12, lineHeight: 20 },
  modalStats: { color: theme.textDim, fontSize: 13, fontWeight: "600", marginBottom: 20 },
  modalBtns: { flexDirection: "row", gap: 12, width: "100%" },
  modalBtnMain: { flex: 1, backgroundColor: theme.ember, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  modalBtnMainText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  modalBtnSec: { flex: 1, backgroundColor: theme.border, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  modalBtnSecText: { color: theme.textMuted, fontSize: 15, fontWeight: "700" },

  // Onboarding styles
  onboardingOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 24 },
  onboardingCard: { backgroundColor: theme.surface, borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, borderWidth: 1, borderColor: theme.border },
  onboardingStepCount: { fontSize: 13, fontFamily: theme.fonts.semiBold, color: theme.textDim, marginBottom: 8 },
  onboardingTitle: { fontSize: 22, fontFamily: theme.fonts.bold, color: theme.text, marginBottom: 12 },
  onboardingText: { fontSize: 15, fontFamily: theme.fonts.regular, color: theme.textMuted, lineHeight: 22, marginBottom: 24 },
  onboardingDots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 },
  onboardingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.border },
  onboardingDotActive: { backgroundColor: theme.ember, width: 20 },
  onboardingButtons: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  onboardingBtnPrimary: { flex: 1, backgroundColor: theme.ember, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  onboardingBtnSecondary: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  onboardingBtnPrimaryText: { color: "#fff", fontSize: 15, fontFamily: theme.fonts.bold },
  onboardingBtnSecondaryText: { color: theme.textMuted, fontSize: 15, fontFamily: theme.fonts.semiBold },
});
