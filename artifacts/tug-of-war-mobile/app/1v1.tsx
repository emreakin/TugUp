import { router } from "expo-router";
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
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Constants ────────────────────────────────────────────────────

const CHAR_WIDTH = 100;
const ROPE_PAD = 4;
const WINDOW_WIDTH = Dimensions.get("window").width;
const MAX_TRANSLATION = WINDOW_WIDTH / 2 - ROPE_PAD - CHAR_WIDTH / 2;

const CHARACTER_IMG = require("@/assets/images/character.png");
const ROPE_IMG = require("@/assets/images/rope.png");

function getApiUrl(): string {
  if (Platform.OS === "web") return "";
  return (
    process.env.EXPO_PUBLIC_API_BASE ??
    `https://${
      process.env.EXPO_PUBLIC_REPLIT_DEV_DOMAIN ??
      "72a67990-7136-40a7-a2ca-48f1c4842176-00-26avhjd9y0o9l.janeway.replit.dev"
    }`
  );
}

// ─── Types ─────────────────────────────────────────────────────────

type Phase = "name_input" | "connecting" | "waiting" | "countdown" | "playing" | "ended";

interface MatchupInfo {
  id: string;
  leftTeam: string;
  rightTeam: string;
  leftColor: string;
  rightColor: string;
  emoji: string;
  winThreshold: number;
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

const STEPS_1V1 = [
  {
    title: "\ud83c\udfa1 1v1 Ger\u00e7ek Zamanl\u0131 Oyna",
    text:
      "Ba\u015fka bir oyuncuyla e\u015fle\u015f ve kar\u015f\u0131l\u0131kl\u0131 halat \u00e7ek! \u0130ki karakter, bir halat ve tek ama\u00e7: rakibini kendi taraf\u0131na \u00e7ekmek.",
  },
  {
    title: "\ud83e\udde9 Oynamak \u00c7ok Basit",
    text:
      "Ekran\u0131n alt\u0131ndaki butona h\u0131zl\u0131ca t\u0131kla. Her t\u0131klamanda halat senin taraf\u0131na do\u011fru kayar. Ama dikkat: rakibin de ayn\u0131 \u015feyi yap\u0131yor!",
  },
  {
    title: "\ud83c\udfaf Kazanmak i\u00e7in",
    text:
      "Halat\u0131 merkez \u00e7izgiden kar\u015f\u0131 taraf\u0131n sonuna kadar \u00e7ekmek zorundas\u0131n. \u0130lerleme \u00e7ubu\u011funu takip et — rakibini yener misin?",
  },
  {
    title: "\u2705 E\u015fle\u015fme Bekleme",
    text:
      "Ad\u0131n\u0131 yazd\u0131ktan sonra oyun seni otomatik olarak bir rakiple e\u015fle\u015ftiriyor. Rakibin gelene kadar bu ekranda bekle. Haz\u0131rsan ba\u015fla!",
  },
];

// ─── Main Screen ─────────────────────────────────────────────────────

export default function OneVsOneScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  // ── Phase & matchmaking state ───────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("name_input");
  const [matchup, setMatchup] = useState<MatchupInfo | null>(null);
  const [mySide, setMySide] = useState<"left" | "right">("left");
  const [countdownNum, setCountdownNum] = useState(5);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [opponentName, setOpponentName] = useState<string | null>(null);

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
    if (onboardingStep < STEPS_1V1.length - 1) {
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
  const phaseRef = useRef<Phase>("name_input");
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
      const res = await fetch(`${getApiUrl()}/api/game/state/${roomId}?playerToken=${token}`);
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

  // ── Connect / Join ──────────────────────────────────────────────
  const connect = useCallback(async () => {
    setPhase("connecting");
    setErrorMsg(null);
    setOffset(0);
    setLeftPulls(0);
    setRightPulls(0);
    setWinner(null);
    setOpponentName(null);
    resetAnimations();

    try {
      // Load existing token
      let token = await AsyncStorage.getItem("player_token");

      const res = await fetch(`${getApiUrl()}/api/game/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName || "Oyuncu", playerToken: token }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.message ?? "Sunucu hatası.");
        setPhase("connecting");
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

      // Start polling — use ref so interval always calls the latest pollState
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(() => { pollStateRef.current(); }, 500);
    } catch (err) {
      setErrorMsg("Sunucuya bağlanılamadı.");
      setPhase("connecting");
    }
  }, [playerName, pollState, resetAnimations]);

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
            headers: { "Content-Type": "application/json" },
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerToken: token }),
        }).catch(() => {});
      }
    };
  }, []);

  // ── Handle pull ───────────────────────────────────────────────
  const handlePull = useCallback(async () => {
    if (phase !== "playing") return;
    pulseButton(mySide);

    const roomId = roomIdRef.current;
    const token = playerTokenRef.current;
    if (!roomId || !token) return;

    try {
      await fetch(`${getApiUrl()}/api/game/pull/${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const timer = setInterval(() => {
      setCountdownNum(n => {
        if (n <= 1) {
          clearInterval(timer);
          setPhase("playing");
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // ── Name input screen ────────────────────────────────────────
  if (phase === "name_input") {
    return (
      <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <Pressable onPress={() => { const rid = roomIdRef.current; const tok = playerTokenRef.current; if (rid && tok) { fetch(`${getApiUrl()}/api/game/leave/${rid}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerToken: tok }) }).catch(() => {}); } router.back(); }} style={styles.backBtn}>
            <Text style={styles.backText}>← Ana Menü</Text>
          </Pressable>
          <Text style={styles.headerTitle}>1v1</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.nameInputContent}>
          <Text style={styles.nameInputEmoji}>🎮</Text>
          <Text style={styles.nameInputTitle}>1v1</Text>
          <Text style={styles.nameInputSubtitle}>Mücadeleye katılmadan önce adını gir</Text>
          <TextInput
            style={styles.nameInputField}
            placeholder="Kullanıcı Adı"
            placeholderTextColor="#475569"
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
            <Text style={styles.nameInputBtnText}>Başla 💪</Text>
          </Pressable>
        </View>

        {/* 1v1 Onboarding Modal */}
        <Modal visible={showOnboarding} transparent animationType="fade">
          <View style={styles.onboardingOverlay}>
            <View style={styles.onboardingCard}>
              <Text style={styles.onboardingStepCount}>
                {onboardingStep + 1} / {STEPS_1V1.length}
              </Text>
              <Text style={styles.onboardingTitle}>{STEPS_1V1[onboardingStep].title}</Text>
              <Text style={styles.onboardingText}>{STEPS_1V1[onboardingStep].text}</Text>

              <View style={styles.onboardingDots}>
                {STEPS_1V1.map((_, i) => (
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
                {onboardingStep < STEPS_1V1.length - 1 ? (
                  <>
                    <Pressable
                      style={styles.onboardingBtnSecondary}
                      onPress={handleOnboardingSkip}
                    >
                      <Text style={styles.onboardingBtnSecondaryText}>Atla</Text>
                    </Pressable>
                    <Pressable
                      style={styles.onboardingBtnPrimary}
                      onPress={handleOnboardingNext}
                    >
                      <Text style={styles.onboardingBtnPrimaryText}>İleri</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    style={styles.onboardingBtnPrimary}
                    onPress={handleOnboardingNext}
                  >
                    <Text style={styles.onboardingBtnPrimaryText}>Başla!</Text>
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
          <Pressable onPress={() => { const rid = roomIdRef.current; const tok = playerTokenRef.current; if (rid && tok) { fetch(`${getApiUrl()}/api/game/leave/${rid}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerToken: tok }) }).catch(() => {}); } router.back(); }} style={styles.backBtn}>
            <Text style={styles.backText}>← Ana Menü</Text>
          </Pressable>
          <Text style={styles.headerTitle}>1v1</Text>
          <View style={styles.headerSpacer} />
        </View>
        {errorMsg ? (
          <>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable style={styles.retryBtn} onPress={connect}>
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color="#ef4444" size="large" />
            <Text style={styles.connectingText}>Sunucuya bağlanıyor…</Text>
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
          <Pressable onPress={() => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); const rid = roomIdRef.current; const tok = playerTokenRef.current; if (rid && tok) { fetch(`${getApiUrl()}/api/game/leave/${rid}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerToken: tok }) }).catch(() => {}); } router.back(); }} style={styles.backBtn}>
            <Text style={styles.backText}>← Ana Menü</Text>
          </Pressable>
          <Text style={styles.headerTitle}>1v1</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Matchup badge */}
        {matchup && (
          <View style={styles.matchupBadge}>
            <Text style={styles.matchupEmoji}>{matchup.emoji}</Text>
            <Text style={[styles.matchupTeam, { color: leftColor }]}>{matchup.leftTeam}</Text>
            <Text style={styles.matchupVs}>vs</Text>
            <Text style={[styles.matchupTeam, { color: rightColor }]}>{matchup.rightTeam}</Text>
          </View>
        )}

        {/* Arena */}
        <View style={styles.waitingArena}>
          {/* My side */}
          <View style={styles.waitingSlot}>
            <View style={[styles.avatarGlow, { backgroundColor: myColor + "33", shadowColor: myColor }]} />
            <Image source={CHARACTER_IMG} style={[styles.waitingAvatar, mySide === "right" && { transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
            <Text style={[styles.waitingSlotLabel, { color: myColor }]}>{playerName || "Sen"}</Text>
            <Text style={[styles.waitingReady, { color: myColor }]}>✓ Hazır</Text>
          </View>

          {/* VS divider */}
          <View style={styles.waitingVsDivider}>
            <View style={[styles.vsDividerLine, { backgroundColor: "#1e293b" }]} />
            <View style={[styles.vsCircle, { borderColor: "#334155" }]}>
              <Text style={styles.vsText}>VS</Text>
            </View>
            <View style={[styles.vsDividerLine, { backgroundColor: "#1e293b" }]} />
          </View>

          {/* Opponent side */}
          <View style={styles.waitingSlot}>
            {phase === "waiting" ? (
              <>
                <View style={[styles.avatarGlow, { backgroundColor: "#33415555" }]} />
                <View style={styles.waitingAvatarPlaceholder}>
                  <Text style={styles.waitingAvatarQuestion}>?</Text>
                </View>
                <Text style={[styles.waitingSlotLabel, { color: opponentColor }]}>{opponentName ?? "Rakip"}</Text>
                <View style={styles.waitingOpponentRow}>
                  <ActivityIndicator color="#475569" size="small" />
                  <Text style={styles.waitingForText}>Rakip Bekleniyor</Text>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.avatarGlow, { backgroundColor: opponentColor + "33", shadowColor: opponentColor }]} />
                <Image source={CHARACTER_IMG} style={[styles.waitingAvatar, mySide === "left" && { transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
                <Text style={[styles.waitingSlotLabel, { color: opponentColor }]}>{opponentName ?? "Rakip"}</Text>
                <Text style={[styles.waitingReady, { color: opponentColor }]}>✓ Hazır</Text>
              </>
            )}
          </View>
        </View>

        {/* Countdown overlay */}
        {phase === "countdown" && (
          <View style={styles.countdownContainer}>
            <Text style={styles.countdownNumber}>{countdownNum}</Text>
            <Text style={styles.countdownLabel}>BAŞLIYOR</Text>
          </View>
        )}

        {phase === "waiting" && (
          <View style={styles.waitingFooter}>
            <Text style={styles.waitingFooterText}>
              Eşleşme aranıyor… Bu ekranda kal!
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── Game screen (playing / ended) ────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); const rid = roomIdRef.current; const tok = playerTokenRef.current; if (rid && tok) { fetch(`${getApiUrl()}/api/game/leave/${rid}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerToken: tok }) }).catch(() => {}); } router.back(); }} style={styles.backBtn}>
          <Text style={styles.backText}>← Ana Menü</Text>
        </Pressable>
        <Text style={styles.headerTitle}>1v1</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Player names */}
      <View style={styles.teamRow}>
        <Text style={[styles.teamLabel, { color: leftColor }]} numberOfLines={1}>
          {mySide === "left" ? playerName : opponentName ?? "Rakip"}
        </Text>
        <Text style={styles.vsLabel}>vs</Text>
        <Text style={[styles.teamLabel, { color: rightColor }]} numberOfLines={1}>
          {mySide === "right" ? playerName : opponentName ?? "Rakip"}
        </Text>
      </View>

      {/* Rope area */}
      <View style={styles.ropeArea}>
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

        <View style={styles.centerLine} pointerEvents="none" />

        {/* Progress bar */}
        <View style={styles.progressWrap} pointerEvents="none">
          <View style={styles.progressCard}>
            <View style={[styles.progressBadge, { backgroundColor: leftColor + "22", borderColor: leftColor }]}>
              <Text style={[styles.progressBadgeNum, { color: leftColor }]}>{leftRemaining}</Text>
              <Text style={[styles.progressBadgeLabel, { color: leftColor }]}>KALDI</Text>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFillLeft, { backgroundColor: leftColor, width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["100%", "0%"] }) }]} />
              <Animated.View style={[styles.progressFillRight, { backgroundColor: rightColor, width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
              <Animated.View style={[styles.progressMarker, { left: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
            </View>
            <View style={[styles.progressBadge, { backgroundColor: rightColor + "22", borderColor: rightColor }]}>
              <Text style={[styles.progressBadgeNum, { color: rightColor }]}>{rightRemaining}</Text>
              <Text style={[styles.progressBadgeLabel, { color: rightColor }]}>KALDI</Text>
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
                💪 ÇEK!
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
                ÇEK! 💪
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
            <Text style={styles.modalEmoji}>{isWinner ? "🏆" : "😢"}</Text>
            <Text style={[styles.modalTitle, { color: isWinner ? myColor : opponentColor }]}>
              {isWinner ? "KAZANDIN!" : "KAYBETTİN"}
            </Text>
            <Text style={styles.modalSubtitle}>
              {isWinner
                ? `Tebrıkler ${playerName || "Oyuncu"}, ${opponentName ?? "Rakip"} karşısında zafer senin!`
                : `${opponentName ?? "Rakip"} bu mücadeleyi kazandı. Bir dahaki sefere güçlü dön!`}
            </Text>
            <Text style={styles.modalStats}>
              {"\n"}
            </Text>
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalBtnMain} onPress={playAgain}>
                <Text style={styles.modalBtnMainText}>🔄 Yeniden Oyna</Text>
              </Pressable>
              <Pressable style={styles.modalBtnSec} onPress={() => router.back()}>
                <Text style={styles.modalBtnSecText}>Ana Menü</Text>
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
  container: { flex: 1, backgroundColor: "#0f172a" },
  centered: { alignItems: "center", justifyContent: "center", gap: 20 },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { padding: 10 },
  headerTitle: { color: "#f8fafc", fontSize: 18, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
  headerSpacer: { width: 70 },
  backText: { color: "#94a3b8", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  nameInputContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  nameInputEmoji: { fontSize: 56 },
  nameInputTitle: { color: "#f8fafc", fontSize: 28, fontWeight: "900", letterSpacing: 1 },
  nameInputSubtitle: { color: "#64748b", fontSize: 14, fontWeight: "600" },
  nameInputField: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16, width: "100%", color: "#f8fafc", fontSize: 18, fontWeight: "600", borderWidth: 1, borderColor: "#334155" },
  nameInputBtn: { backgroundColor: "#ef4444", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32, width: "100%", alignItems: "center" },
  nameInputBtnPressed: { opacity: 0.8 },
  nameInputBtnText: { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 1 },

  errorEmoji: { fontSize: 48 },
  errorText: { color: "#ef4444", fontSize: 16, fontWeight: "600", textAlign: "center" },
  retryBtn: { backgroundColor: "#ef4444", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  retryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  connectingText: { color: "#64748b", fontSize: 16, fontWeight: "600", marginTop: 12 },

  matchupBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  matchupEmoji: { fontSize: 24 },
  matchupTeam: { fontSize: 16, fontWeight: "800" },
  matchupVs: { color: "#64748b", fontSize: 14, fontWeight: "700" },

  waitingArena: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, gap: 12, flex: 1 },
  waitingSlot: { flex: 1, alignItems: "center", gap: 8 },
  avatarGlow: { width: 80, height: 80, borderRadius: 40, position: "absolute", opacity: 0.3 },
  waitingAvatar: { width: 80, height: 80 },
  waitingAvatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#334155", alignItems: "center", justifyContent: "center" },
  waitingAvatarQuestion: { color: "#64748b", fontSize: 32, fontWeight: "800" },
  waitingSlotLabel: { fontSize: 14, fontWeight: "700" },
  waitingReady: { fontSize: 12, fontWeight: "700" },
  waitingOpponentRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  waitingForText: { color: "#475569", fontSize: 12, fontWeight: "600" },
  waitingVsDivider: { alignItems: "center", gap: 8 },
  vsDividerLine: { width: 2, height: 40, borderRadius: 1 },
  vsCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  vsText: { color: "#64748b", fontSize: 12, fontWeight: "800" },
  waitingFooter: { paddingVertical: 20, alignItems: "center" },
  waitingFooterText: { color: "#475569", fontSize: 14, fontWeight: "600" },

  countdownContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15,23,42,0.85)", alignItems: "center", justifyContent: "center", zIndex: 100 },
  countdownNumber: { color: "#ef4444", fontSize: 120, fontWeight: "900" },
  countdownLabel: { color: "#f8fafc", fontSize: 20, fontWeight: "800", letterSpacing: 4 },

  teamRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginTop: 8 },
  teamLabel: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center", letterSpacing: 0.5 },
  vsLabel: { color: "#475569", fontSize: 13, fontFamily: "Inter_600SemiBold", marginHorizontal: 10 },

  clickRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 40, marginTop: 6, marginBottom: 4 },
  clickCount: { fontSize: 20, fontFamily: "Inter_700Bold" },

  ropeArea: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: ROPE_PAD, position: "relative" },
  charSlot: { width: CHAR_WIDTH, alignItems: "center", justifyContent: "center" },
  charWrap: { alignItems: "center" },
  charGlow: { width: 100, height: 100, borderRadius: 50, position: "absolute", opacity: 0.3 },
  charImage: { width: 100, height: 100 },
  ropeWrap: { flex: 1, height: 140, overflow: "hidden" },
  ropeImgWrap: { position: "absolute", top: 64, height: 4 },
  ropeImg: { width: "100%", height: 4 },
  centerLine: { position: "absolute", top: "50%", left: "50%", width: 5, height: 90, backgroundColor: "#ef4444", borderRadius: 2.5, marginLeft: -2.5, marginTop: -45, shadowColor: "#ef4444", shadowOpacity: 0.9, shadowRadius: 10, elevation: 8, zIndex: 10 },

  progressWrap: { position: "absolute", top: "50%", marginTop: 110, left: 16, right: 16, alignItems: "center" },
  progressCard: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(15,23,42,0.85)", borderRadius: 22, paddingVertical: 10, paddingHorizontal: 12, gap: 12, width: "100%", maxWidth: 360, borderWidth: 1, borderColor: "rgba(148,163,184,0.2)", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  progressBadge: { minWidth: 56, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, alignItems: "center" },
  progressBadgeNum: { fontSize: 20, fontWeight: "900", lineHeight: 24 },
  progressBadgeLabel: { fontSize: 9, fontWeight: "600", letterSpacing: 1.2, opacity: 0.9 },
  progressTrack: { flex: 1, height: 10, backgroundColor: "rgba(148,163,184,0.15)", borderRadius: 5, overflow: "visible", position: "relative" },
  progressFillLeft: { position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 5, opacity: 0.85 },
  progressFillRight: { position: "absolute", top: 0, bottom: 0, right: 0, borderRadius: 5, opacity: 0.85 },
  progressMarker: { position: "absolute", top: -3, bottom: -3, width: 4, backgroundColor: "#f8fafc", borderRadius: 2, zIndex: 5 },

  buttonsRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  buttonWrap: { flex: 1 },
  pullBtn: { borderRadius: 18, paddingVertical: 22, alignItems: "center", borderWidth: 2 },
  pullBtnDisabled: { opacity: 0.4 },
  pullBtnText: { fontSize: 18, fontWeight: "900", letterSpacing: 1 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  modalCard: { backgroundColor: "#1e293b", borderRadius: 24, padding: 28, margin: 24, alignItems: "center", width: "90%", maxWidth: 360, position: "relative", overflow: "hidden" },
  modalGlow: { position: "absolute", top: -60, width: 200, height: 200, borderRadius: 100, alignSelf: "center" },
  modalEmoji: { fontSize: 56, marginBottom: 8 },
  modalTitle: { fontSize: 28, fontWeight: "900", letterSpacing: 1, marginBottom: 8 },
  modalSubtitle: { color: "#94a3b8", fontSize: 14, fontWeight: "600", textAlign: "center", marginBottom: 12, lineHeight: 20 },
  modalStats: { color: "#64748b", fontSize: 13, fontWeight: "600", marginBottom: 20 },
  modalBtns: { flexDirection: "row", gap: 12, width: "100%" },
  modalBtnMain: { flex: 1, backgroundColor: "#ef4444", borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  modalBtnMainText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  modalBtnSec: { flex: 1, backgroundColor: "#334155", borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  modalBtnSecText: { color: "#94a3b8", fontSize: 15, fontWeight: "700" },

  // Onboarding styles
  onboardingOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 24 },
  onboardingCard: { backgroundColor: "#1e293b", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, borderWidth: 1, borderColor: "#334155" },
  onboardingStepCount: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#64748b", marginBottom: 8 },
  onboardingTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#f8fafc", marginBottom: 12 },
  onboardingText: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#cbd5e1", lineHeight: 22, marginBottom: 24 },
  onboardingDots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 },
  onboardingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#334155" },
  onboardingDotActive: { backgroundColor: "#ef4444", width: 20 },
  onboardingButtons: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  onboardingBtnPrimary: { flex: 1, backgroundColor: "#ef4444", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  onboardingBtnSecondary: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#334155" },
  onboardingBtnPrimaryText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  onboardingBtnSecondaryText: { color: "#94a3b8", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
