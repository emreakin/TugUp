import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Trans, useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Constants ────────────────────────────────────────────────────────────────
const CHAR_WIDTH = 100;
const ROPE_PAD = 4;
const WINDOW_WIDTH = Dimensions.get("window").width;
const MAX_TRANSLATION = WINDOW_WIDTH / 2 - ROPE_PAD - CHAR_WIDTH / 2;
const WIN_THRESHOLD = 100;
const TICK_MS = 50;

const CHARACTER_IMG = require("@/assets/images/character.png");
const ROPE_IMG = require("@/assets/images/rope.png");

// ─── Level config ─────────────────────────────────────────────────────────────
// Ağırlık katsayısı: unitPerTap = round(180 / weight^0.45, 1)
// Bowling topu   6 kg   → ≈ 8
// Çamaşır mak. 80 kg   → ≈ 4
// Kanepe        50 kg   → ≈ 4.5
// ATV          300 kg   → ≈ 2
// Araba       1500 kg   → ≈ 1.2
// SUV         2500 kg   → ≈ 0.9
// Kamyonet    3500 kg   → ≈ 0.8
// Otobüs     12000 kg   → ≈ 0.4
// Fil         5000 kg   → ≈ 0.7
// T-Rex       8000 kg   → ≈ 0.5
interface Level {
  id: number;
  name: string;
  emoji: string;
  image?: any;
  weight: number;
  timeLimit: number;
  unitPerTap: number;
  driftPerSec: number;
  accentColor: string;
  description: string;
}

interface LevelConfig {
  id: number;
  emoji: string;
  image?: any;
  weight: number;
  timeLimit: number;
  unitPerTap: number;
  driftPerSec: number;
  accentColor: string;
}

const LEVEL_CONFIGS: LevelConfig[] = [
  {
    id: 1,
    emoji: "🎳",
    weight: 6,
    timeLimit: 8,
    unitPerTap: 8,
    driftPerSec: 0.5,
    accentColor: "#22c55e",
  },
  {
    id: 2,
    emoji: "🛋️",
    weight: 50,
    timeLimit: 8,
    unitPerTap: 4.5,
    driftPerSec: 1.0,
    accentColor: "#f59e0b",
  },
  {
    id: 3,
    emoji: "🌀",
    image: require("@/assets/images/washing-machine.png"),
    weight: 100,
    timeLimit: 8,
    unitPerTap: 4,
    driftPerSec: 1.5,
    accentColor: "#3b82f6",
  },
  {
    id: 4,
    emoji: "🧊",
    image: require("@/assets/fridge_ai.png"),
    weight: 200,
    timeLimit: 10,
    unitPerTap: 3.5,
    driftPerSec: 2.0,
    accentColor: "#06b6d4",
  },
  {
    id: 5,
    emoji: "🏍️",
    image: require("@/assets/images/atv.png"),
    weight: 300,
    timeLimit: 10,
    unitPerTap: 2,
    driftPerSec: 2.5,
    accentColor: "#ef4444",
  },
  {
    id: 6,
    emoji: "🐂",
    weight: 1000,
    timeLimit: 10,
    unitPerTap: 1.5,
    driftPerSec: 2.0,
    accentColor: "#92400e",
  },
  {
    id: 7,
    emoji: "🚗",
    weight: 1500,
    timeLimit: 10,
    unitPerTap: 1.2,
    driftPerSec: 2.0,
    accentColor: "#8b5cf6",
  },
  {
    id: 8,
    emoji: "🚙",
    image: require("@/assets/images/suv.png"),
    weight: 2500,
    timeLimit: 10,
    unitPerTap: 0.9,
    driftPerSec: 4.0,
    accentColor: "#ec4899",
  },
  {
    id: 9,
    emoji: "🛻",
    image: require("@/assets/images/pickup-truck.png"),
    weight: 3500,
    timeLimit: 10,
    unitPerTap: 0.8,
    driftPerSec: 4.5,
    accentColor: "#14b8a6",
  },
  {
    id: 10,
    emoji: "🐘",
    image: require("@/assets/images/elephant.png"),
    weight: 5000,
    timeLimit: 10,
    unitPerTap: 0.7,
    driftPerSec: 5.0,
    accentColor: "#64748b",
  },
  {
    id: 11,
    emoji: "🦖",
    image: require("@/assets/images/trex.png"),
    weight: 7500,
    timeLimit: 12,
    unitPerTap: 0.5,
    driftPerSec: 6.0,
    accentColor: "#dc2626",
  },
  {
    id: 12,
    emoji: "🐋",
    weight: 10000,
    timeLimit: 12,
    unitPerTap: 0.45,
    driftPerSec: 6.5,
    accentColor: "#1e40af",
  },
  {
    id: 13,
    emoji: "🚌",
    image: require("@/assets/images/bus.png"),
    weight: 12000,
    timeLimit: 12,
    unitPerTap: 0.4,
    driftPerSec: 7.0,
    accentColor: "#f97316",
  },
  {
    id: 14,
    emoji: "⚓",
    weight: 15000,
    timeLimit: 15,
    unitPerTap: 0.35,
    driftPerSec: 7.5,
    accentColor: "#0891b2",
  },
  {
    id: 15,
    emoji: "🏗️",
    weight: 20000,
    timeLimit: 15,
    unitPerTap: 0.3,
    driftPerSec: 8.0,
    accentColor: "#eab308",
  },
];

function buildLevels(t: (key: string, options?: Record<string, unknown>) => string): Level[] {
  return LEVEL_CONFIGS.map((cfg) => ({
    ...cfg,
    name: t(`quickGame.levelList.${cfg.id}.name`),
    description: t(`quickGame.levelList.${cfg.id}.description`, {
      weight: cfg.weight,
      seconds: cfg.timeLimit,
    }),
  }));
}

// ─── Character component (same as 1v1) ───────────────────────────────────────
function Character({
  bounceAnim,
  color,
  fallRotate,
  fallOpacity,
  victoryScale,
}: {
  bounceAnim: Animated.Value;
  color: string;
  fallRotate?: Animated.Value;
  fallOpacity?: Animated.Value;
  victoryScale?: Animated.Value;
}) {
  const transform: any[] = [{ translateX: bounceAnim }];
  if (victoryScale) transform.push({ scale: victoryScale });
  if (fallRotate) {
    transform.push({
      rotate: fallRotate.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "100deg"],
      }),
    });
  }
  return (
    <Animated.View
      style={[
        styles.charWrap,
        { transform, opacity: fallOpacity ?? 1 },
      ]}
    >
      <View
        style={[
          styles.charGlow,
          { backgroundColor: color + "33", shadowColor: color },
        ]}
      />
      <Image
        source={CHARACTER_IMG}
        style={styles.charImage}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

// ─── Object (opponent) component ─────────────────────────────────────────────
function ObjectDisplay({
  emoji,
  image,
  bounceAnim,
  color,
  fallRotate,
  fallOpacity,
  victoryScale,
}: {
  emoji: string;
  image?: any;
  bounceAnim: Animated.Value;
  color: string;
  fallRotate?: Animated.Value;
  fallOpacity?: Animated.Value;
  victoryScale?: Animated.Value;
}) {
  const transform: any[] = [{ translateX: bounceAnim }];
  if (victoryScale) transform.push({ scale: victoryScale });
  if (fallRotate) {
    transform.push({
      rotate: fallRotate.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "-100deg"],
      }),
    });
  }
  return (
    <Animated.View
      style={[
        styles.charWrap,
        { transform, opacity: fallOpacity ?? 1 },
      ]}
    >
      <View
        style={[
          styles.charGlow,
          { backgroundColor: color + "33", shadowColor: color },
        ]}
      />
      {image ? (
        <Image source={image} style={styles.objectImage} resizeMode="contain" />
      ) : (
        <Text style={styles.objectEmoji}>{emoji}</Text>
      )}
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
type Phase = "levels" | "playing" | "celebrating" | "win" | "lose";

export default function QuickGameScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const levels = useMemo(() => buildLevels(t), [t]);
  const topInset = Platform.OS === "web" ? 16 : insets.top;
  const bottomInset = Platform.OS === "web" ? 16 : insets.bottom;

  // ── Persistent progress key ───────────────────────────────────────────────
  const PROGRESS_KEY = "@tugup_quickgame_progress";
  const BEST_TIMES_KEY = "@tugup_quickgame_besttimes";
  const TUTORIAL_SHOWN_KEY = "@tugup_quickgame_tutorial";

  // ── State ────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("levels");
  const [currentLevelId, setCurrentLevelId] = useState(1);
  const currentLevel = levels.find((level) => level.id === currentLevelId) ?? levels[0];
  const [unlockedUpTo, setUnlockedUpTo] = useState(1);
  const [timeLeft, setTimeLeft] = useState(0);
  // Global joker pool — persisted across sessions
  const [timeJokersLeft, setTimeJokersLeft] = useState(3);
  const [bombJokersLeft, setBombJokersLeft] = useState(3);
  // Loading state for ad-earn button
  const [adLoading, setAdLoading] = useState(false);
  // Joker picker modal (shown after rewarded ad)
  const [jokerPickerVisible, setJokerPickerVisible] = useState(false);
  // Best times per level (levelId -> remaining seconds at win)
  const [bestTimes, setBestTimes] = useState<Record<number, number>>({});
  // Whether the current win set a new best time (shown in modal)
  const [isNewRecord, setIsNewRecord] = useState(false);
  // First-time tutorial modal
  const [showTutorial, setShowTutorial] = useState(false);

  // position: 0 = object at start (opponent side), 100 = object crossed line (player wins)
  const positionRef = useRef(0);
  const timeLeftRef = useRef(0);
  const [position, setPosition] = useState(0);

  const driftIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Animations (mirrors 1v1) ─────────────────────────────────────────────
  // Player (left) stays still; object (right) gets pulled toward center
  const playerCharAnim = useRef(new Animated.Value(0)).current; // bounce on tap
  const objectCharAnim = useRef(new Animated.Value(0)).current; // bounce when drifting
  const playerPulseAnim = useRef(new Animated.Value(1)).current;
  // Win/lose modal animations
  const winScaleAnim = useRef(new Animated.Value(0)).current;
  const winTranslateAnim = useRef(new Animated.Value(50)).current;
  const loseShakeAnim = useRef(new Animated.Value(0)).current;
  // Celebration (3s pre-result) animations
  const pendingResultRef = useRef<"win" | "lose" | null>(null);
  const celebrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectFallRotate = useRef(new Animated.Value(0)).current;
  const objectFallOpacity = useRef(new Animated.Value(1)).current;
  const playerFallRotate = useRef(new Animated.Value(0)).current;
  const playerFallOpacity = useRef(new Animated.Value(1)).current;
  const winnerBounceAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0.5)).current;
  const playerCharShift = useRef(new Animated.Value(0)).current; // always 0 (player doesn't move)
  const objectCharShift = useRef(new Animated.Value(0)).current; // object slides toward center
  const ropeWrapWidthAnim = useRef(
    new Animated.Value(WINDOW_WIDTH - 2 * CHAR_WIDTH - 2 * ROPE_PAD),
  ).current;

  // ── Load & save progress via AsyncStorage ────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(PROGRESS_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (typeof saved.unlockedUpTo === "number") setUnlockedUpTo(saved.unlockedUpTo);
        if (typeof saved.timeJokersLeft === "number") setTimeJokersLeft(saved.timeJokersLeft);
        if (typeof saved.bombJokersLeft === "number") setBombJokersLeft(saved.bombJokersLeft);
      })
      .catch(() => {});
    AsyncStorage.getItem(BEST_TIMES_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved && typeof saved === "object") setBestTimes(saved);
      })
      .catch(() => {});
    AsyncStorage.getItem(TUTORIAL_SHOWN_KEY)
      .then((raw) => {
        if (raw !== "true") setShowTutorial(true);
      })
      .catch(() => {});
  }, [PROGRESS_KEY, BEST_TIMES_KEY, TUTORIAL_SHOWN_KEY]);

  const saveProgress = useCallback(
    (unlockedUpToVal: number, timeLeft: number, bombLeft: number) => {
      AsyncStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify({ unlockedUpTo: unlockedUpToVal, timeJokersLeft: timeLeft, bombJokersLeft: bombLeft }),
      ).catch(() => {});
    },
    [PROGRESS_KEY],
  );

  // ── Win / Lose modal animations (trigger on phase change) ────────────────
  useEffect(() => {
    if (phase === "win") {
      winScaleAnim.setValue(0);
      winTranslateAnim.setValue(50);
      Animated.parallel([
        Animated.spring(winScaleAnim, { toValue: 1, useNativeDriver: true, friction: 6 }),
        Animated.spring(winTranslateAnim, { toValue: 0, useNativeDriver: true, friction: 6 }),
      ]).start();
    } else if (phase === "lose") {
      loseShakeAnim.setValue(0);
      Animated.sequence([
        Animated.timing(loseShakeAnim, { toValue: -15, duration: 100, useNativeDriver: true }),
        Animated.timing(loseShakeAnim, { toValue: 15, duration: 100, useNativeDriver: true }),
        Animated.timing(loseShakeAnim, { toValue: -10, duration: 100, useNativeDriver: true }),
        Animated.timing(loseShakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
        Animated.timing(loseShakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]).start();
    }
  }, [phase]);

  // ── Celebration animation (3s field animation before result modal) ───────
  useEffect(() => {
    if (phase !== "celebrating") return;
    const outcome = pendingResultRef.current;

    if (outcome === "win") {
      // Object gets fully dragged off-screen (left) and topples over
      objectFallRotate.setValue(0);
      objectFallOpacity.setValue(1);
      winnerBounceAnim.setValue(1);
      Animated.spring(objectCharShift, {
        toValue: -MAX_TRANSLATION * 1.6,
        useNativeDriver: false,
        tension: 40,
        friction: 7,
      }).start();
      Animated.timing(objectFallRotate, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }).start();
      Animated.timing(objectFallOpacity, {
        toValue: 0,
        duration: 900,
        delay: 300,
        useNativeDriver: true,
      }).start();
      // Player victory bounce loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(winnerBounceAnim, { toValue: 1.15, duration: 220, useNativeDriver: true }),
          Animated.timing(winnerBounceAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]),
        { iterations: 5 },
      ).start();
    } else if (outcome === "lose") {
      // Player gets fully dragged off-screen (right) and topples over
      playerFallRotate.setValue(0);
      playerFallOpacity.setValue(1);
      winnerBounceAnim.setValue(1);
      Animated.spring(playerCharShift, {
        toValue: MAX_TRANSLATION * 1.6,
        useNativeDriver: false,
        tension: 40,
        friction: 7,
      }).start();
      Animated.timing(playerFallRotate, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }).start();
      Animated.timing(playerFallOpacity, {
        toValue: 0,
        duration: 900,
        delay: 300,
        useNativeDriver: true,
      }).start();
      // Object victory bounce loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(winnerBounceAnim, { toValue: 1.15, duration: 220, useNativeDriver: true }),
          Animated.timing(winnerBounceAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]),
        { iterations: 5 },
      ).start();
    }

    celebrationTimeoutRef.current = setTimeout(() => {
      setPhase(outcome === "lose" ? "lose" : "win");
    }, 2000);

    return () => {
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current);
        celebrationTimeoutRef.current = null;
      }
    };
  }, [phase]);

  // ── Intervals cleanup ────────────────────────────────────────────────────
  const clearIntervals = useCallback(() => {
    if (driftIntervalRef.current) {
      clearInterval(driftIntervalRef.current);
      driftIntervalRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (celebrationTimeoutRef.current) {
      clearTimeout(celebrationTimeoutRef.current);
      celebrationTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearIntervals(), [clearIntervals]);

  // ── Update visuals (maps position 0→100 to 1v1 animation system) ────────
  // In 1v1: offset<0 → left winning → rightCharShift goes negative (right pulled left)
  // Here: player is always "left", object is always "right"
  // As position increases (player winning), object shifts LEFT toward center
  const updateVisuals = useCallback(
    (pos: number) => {
      // Convert position (0–100) → offset in 1v1 terms: offset = -(pos/100)*threshold
      const offset = -(pos / 100) * WIN_THRESHOLD;
      const progress = (offset + WIN_THRESHOLD) / (WIN_THRESHOLD * 2); // 0.5 at start, 0 at win
      progressAnim.setValue(Math.max(0, Math.min(1, progress)));

      // Object (right) shifts left as player pulls → rightTarget = (offset/threshold)*MAX_TRANSLATION
      // offset is negative when player is winning → rightTarget is negative → object moves left ✓
      const objectTarget = (offset / WIN_THRESHOLD) * MAX_TRANSLATION;
      Animated.spring(objectCharShift, {
        toValue: objectTarget,
        useNativeDriver: false,
        tension: 80,
        friction: 8,
      }).start();
    },
    [progressAnim, objectCharShift],
  );

  // ── Start game ────────────────────────────────────────────────────────────
  const startGame = useCallback(
    (level: Level) => {
      clearIntervals();
      positionRef.current = 0;
      timeLeftRef.current = level.timeLimit;
      setPosition(0);
      setTimeLeft(level.timeLimit);
      setCurrentLevelId(level.id);
      setIsNewRecord(false);
      setPhase("playing");

      // Reset animations
      playerCharShift.setValue(0);
      objectCharShift.setValue(0);
      playerCharAnim.setValue(0);
      objectCharAnim.setValue(0);
      progressAnim.setValue(0.5);
      ropeWrapWidthAnim.setValue(WINDOW_WIDTH - 2 * CHAR_WIDTH - 2 * ROPE_PAD);

      // Burst drift: every 3s (levels 1–5) or 5s (levels 6+) the object snaps back by 10
      const burstInterval = level.id >= 6 ? 5000 : 3000;
      driftIntervalRef.current = setInterval(() => {
        positionRef.current = Math.max(0, positionRef.current - 10);
        setPosition(positionRef.current);
        updateVisuals(positionRef.current);
      }, burstInterval);

      // Countdown timer — uses timeLeftRef so joker can inject extra seconds
      timerIntervalRef.current = setInterval(() => {
        timeLeftRef.current -= 1;
        setTimeLeft(timeLeftRef.current);
        if (timeLeftRef.current <= 0) {
          clearIntervals();
          pendingResultRef.current = "lose";
          setPhase("celebrating");
        }
      }, 1000);
    },
    [
      clearIntervals,
      updateVisuals,
      playerCharShift,
      objectCharShift,
      playerCharAnim,
      objectCharAnim,
      progressAnim,
      ropeWrapWidthAnim,
    ],
  );

  // ── Tap handler ───────────────────────────────────────────────────────────
  const handlePull = useCallback(() => {
    if (phase !== "playing") return;

    positionRef.current = Math.min(
      WIN_THRESHOLD,
      positionRef.current + currentLevel.unitPerTap,
    );
    setPosition(positionRef.current);
    updateVisuals(positionRef.current);

    // Button pulse
    Animated.sequence([
      Animated.timing(playerPulseAnim, {
        toValue: 0.92,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(playerPulseAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();

    // Player char bounce (same as 1v1 charAnim)
    Animated.sequence([
      Animated.timing(playerCharAnim, {
        toValue: -5,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(playerCharAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 200,
        friction: 8,
      }),
    ]).start();

    // Win check
    if (positionRef.current >= WIN_THRESHOLD) {
      clearIntervals();
      const nextUnlocked = Math.min(LEVEL_CONFIGS.length, Math.max(unlockedUpTo, currentLevel.id + 1));
      setUnlockedUpTo(nextUnlocked);
      saveProgress(nextUnlocked, timeJokersLeft, bombJokersLeft);
      // Best time: remaining seconds = timeLeftRef (includes any joker bonus)
      const remaining = timeLeftRef.current;
      const prevBest = bestTimes[currentLevel.id];
      const brokeRecord = prevBest === undefined || remaining > prevBest;
      if (brokeRecord) {
        const updated = { ...bestTimes, [currentLevel.id]: remaining };
        setBestTimes(updated);
        AsyncStorage.setItem(BEST_TIMES_KEY, JSON.stringify(updated)).catch(() => {});
      }
      setIsNewRecord(brokeRecord);
      pendingResultRef.current = "win";
      setPhase("celebrating");
    }
  }, [
    phase,
    currentLevel,
    unlockedUpTo,
    timeJokersLeft,
    bombJokersLeft,
    bestTimes,
    saveProgress,
    updateVisuals,
    playerPulseAnim,
    playerCharAnim,
    clearIntervals,
  ]);

  // ── Joker: Reklam izleyerek joker kazan ──────────────────────────────────
  const handleEarnJoker = useCallback(async () => {
    const maxJokers = 3;
    const canAddTime = timeJokersLeft < maxJokers;
    const canAddBomb = bombJokersLeft < maxJokers;
    if (!canAddTime && !canAddBomb) {
      Alert.alert(t("quickGame.jokerFullTitle"), t("quickGame.jokerFullMessage"));
      return;
    }

    setAdLoading(true);

    const onReward = () => {
      setAdLoading(false);
      if (Platform.OS === "web") {
        // Web: auto-pick first available
        if (canAddTime) {
          setTimeJokersLeft((prev) => {
            const next = Math.min(maxJokers, prev + 1);
            saveProgress(unlockedUpTo, next, bombJokersLeft);
            return next;
          });
        } else {
          setBombJokersLeft((prev) => {
            const next = Math.min(maxJokers, prev + 1);
            saveProgress(unlockedUpTo, timeJokersLeft, next);
            return next;
          });
        }
      } else {
        // Native: open joker picker modal (Alert won't work while ad is still closing)
        setJokerPickerVisible(true);
      }
    };

    const onError = () => {
      if (Platform.OS === "web") {
        onReward();
      } else {
        Alert.alert(t("quickGame.adFailedTitle"), t("quickGame.adFailedMessage"));
        setAdLoading(false);
      }
    };

    if (Platform.OS !== "web") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { loadRewardedAd } = require("../native/ad-helper");
      try {
        await loadRewardedAd(onReward, onError);
      } catch {
        onError();
      }
    } else {
      // Web preview — skip ad
      onReward();
    }
  }, [unlockedUpTo, timeJokersLeft, bombJokersLeft, saveProgress, t]);

  // ── Joker: Zaman Jokeri (+2 saniye) ──────────────────────────────────────
  const handleTimeJoker = useCallback(() => {
    if (timeJokersLeft <= 0 || phase !== "playing") return;
    timeLeftRef.current += 2;
    setTimeLeft(timeLeftRef.current);
    const newCount = timeJokersLeft - 1;
    setTimeJokersLeft(newCount);
    saveProgress(unlockedUpTo, newCount, bombJokersLeft);
  }, [timeJokersLeft, bombJokersLeft, unlockedUpTo, phase, saveProgress]);

  // ── Joker: Bomba Jokeri (%25 öne) ───────────────────────────────────────
  const handleBombJoker = useCallback(() => {
    if (bombJokersLeft <= 0 || phase !== "playing") return;
    positionRef.current = Math.min(WIN_THRESHOLD, positionRef.current + 25);
    setPosition(positionRef.current);
    updateVisuals(positionRef.current);
    const newCount = bombJokersLeft - 1;
    setBombJokersLeft(newCount);
    saveProgress(unlockedUpTo, timeJokersLeft, newCount);
  }, [bombJokersLeft, timeJokersLeft, unlockedUpTo, phase, updateVisuals, saveProgress]);

  // ── Derived values ────────────────────────────────────────────────────────
  const remaining = Math.max(0, Math.ceil(WIN_THRESHOLD - position));
  const timerColor =
    timeLeft <= 3 ? "#ef4444" : timeLeft <= 5 ? "#f59e0b" : "#f8fafc";
  const playerColor = "#ef4444"; // player always red (same as 1v1 left default)
  const objectColor = currentLevel.accentColor;

  // ── LEVEL SELECTION ────────────────────────────────────────────────────────
  if (phase === "levels") {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: topInset + 8, paddingBottom: bottomInset + 8 },
        ]}
      >
        <StatusBar barStyle="light-content" />

        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← {t("common.mainMenu")}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t("quickGame.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.levelSubtitle}>{t("quickGame.subtitle")}</Text>

        {/* Joker stock + earn bar */}
        <View style={styles.jokerStockBar}>
          <View style={styles.jokerStockPill}>
            <Text style={styles.jokerStockText}>⏳ {timeJokersLeft}/3</Text>
          </View>
          <View style={styles.jokerStockPill}>
            <Text style={styles.jokerStockText}>💥 {bombJokersLeft}/3</Text>
          </View>
          <Pressable
            style={[
              styles.jokerStockPill,
              styles.jokerStockAdBtn,
              timeJokersLeft >= 3 && bombJokersLeft >= 3 && styles.jokerStockAdBtnDisabled,
              adLoading && styles.jokerStockAdBtnLoading,
            ]}
            onPress={handleEarnJoker}
            disabled={(timeJokersLeft >= 3 && bombJokersLeft >= 3) || adLoading}
          >
            <Text style={styles.jokerStockAdText}>
              {adLoading ? t("quickGame.loading") : t("quickGame.earnJoker")}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.levelList}
          contentContainerStyle={styles.levelListContent}
          showsVerticalScrollIndicator={false}
        >
          {levels.map((level) => {
            const unlocked = level.id <= unlockedUpTo;
            return (
              <Pressable
                key={level.id}
                style={({ pressed }) => [
                  styles.levelCard,
                  { borderColor: unlocked ? level.accentColor : "#334155" },
                  !unlocked && styles.levelCardLocked,
                  pressed && unlocked && { opacity: 0.85 },
                ]}
                onPress={() => unlocked && startGame(level)}
                disabled={!unlocked}
              >
                {level.image ? (
                  <Image source={level.image} style={styles.levelEmojiImg} resizeMode="contain" />
                ) : (
                  <Text style={styles.levelEmoji}>{level.emoji}</Text>
                )}
                <View style={styles.levelCardInfo}>
                  <Text
                    style={[
                      styles.levelName,
                      !unlocked && { color: "#475569" },
                    ]}
                  >
                    {!unlocked ? "🔒 " : ""}
                    {level.name}
                  </Text>
                  <Text style={styles.levelDesc}>{level.description}</Text>
                  {unlocked && bestTimes[level.id] !== undefined && (
                    <Text style={styles.levelBestTime}>
                      {t("quickGame.bestTime", { seconds: bestTimes[level.id] })}
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.levelNumBadge,
                    { backgroundColor: unlocked ? level.accentColor : "#334155" },
                  ]}
                >
                  <Text style={styles.levelNumText}>#{level.id}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Joker picker modal — shown after rewarded ad earns reward */}
        <Modal visible={jokerPickerVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { paddingVertical: 28 }]}>
              <Text style={styles.modalEmoji}>🎁</Text>
              <Text style={[styles.modalTitle, { color: "#fbbf24", fontSize: 22 }]}>
                {t("quickGame.jokerEarnTitle")}
              </Text>
              <Text style={[styles.modalSubtitle, { marginBottom: 20 }]}>
                {t("quickGame.jokerEarnSubtitle")}
              </Text>

              <Pressable
                style={[
                  styles.jokerPickerBtn,
                  timeJokersLeft >= 3 && styles.jokerPickerBtnDisabled,
                ]}
                disabled={timeJokersLeft >= 3}
                onPress={() => {
                  setTimeJokersLeft((prev) => {
                    const next = Math.min(3, prev + 1);
                    saveProgress(unlockedUpTo, next, bombJokersLeft);
                    return next;
                  });
                  setJokerPickerVisible(false);
                }}
              >
                <Text style={styles.jokerPickerBtnText}>
                  {t("quickGame.timeJokerPicker")}
                  {timeJokersLeft >= 3
                    ? ` ${t("quickGame.full")}`
                    : ` (${timeJokersLeft} → ${Math.min(3, timeJokersLeft + 1)})`}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.jokerPickerBtn,
                  bombJokersLeft >= 3 && styles.jokerPickerBtnDisabled,
                ]}
                disabled={bombJokersLeft >= 3}
                onPress={() => {
                  setBombJokersLeft((prev) => {
                    const next = Math.min(3, prev + 1);
                    saveProgress(unlockedUpTo, timeJokersLeft, next);
                    return next;
                  });
                  setJokerPickerVisible(false);
                }}
              >
                <Text style={styles.jokerPickerBtnText}>
                  {t("quickGame.bombJokerPicker")}
                  {bombJokersLeft >= 3
                    ? ` ${t("quickGame.full")}`
                    : ` (${bombJokersLeft} → ${Math.min(3, bombJokersLeft + 1)})`}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.jokerPickerBtn, styles.jokerPickerBtnCancel]}
                onPress={() => setJokerPickerVisible(false)}
              >
                <Text style={[styles.jokerPickerBtnText, { color: "#64748b" }]}>{t("common.cancel")}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* First-time tutorial modal */}
        <Modal visible={showTutorial} transparent animationType="fade">
          <View style={styles.tutorialOverlay}>
            <View style={styles.tutorialCard}>
              <Text style={styles.tutorialEmoji}>⚡</Text>
              <Text style={styles.tutorialTitle}>{t("quickGame.tutorial.title")}</Text>

              <View style={styles.tutorialRow}>
                <Text style={styles.tutorialBullet}>✨</Text>
                <Trans
                  i18nKey="quickGame.tutorial.step1"
                  parent={Text}
                  style={styles.tutorialRowText}
                  components={{
                    bold: <Text style={{ fontFamily: "Inter_700Bold", color: "#ef4444" }} />,
                  }}
                />
              </View>

              <View style={styles.tutorialRow}>
                <Text style={styles.tutorialBullet}>⏳</Text>
                <Text style={styles.tutorialRowText}>{t("quickGame.tutorial.step2")}</Text>
              </View>

              <View style={styles.tutorialRow}>
                <Text style={styles.tutorialBullet}>🛡️</Text>
                <Text style={styles.tutorialRowText}>{t("quickGame.tutorial.step3")}</Text>
              </View>

              <View style={styles.tutorialRow}>
                <Text style={styles.tutorialBullet}>🎲</Text>
                <Trans
                  i18nKey="quickGame.tutorial.step4"
                  parent={Text}
                  style={styles.tutorialRowText}
                  components={{
                    time: <Text style={{ fontFamily: "Inter_700Bold", color: "#3b82f6" }} />,
                    bomb: <Text style={{ fontFamily: "Inter_700Bold", color: "#f59e0b" }} />,
                  }}
                />
              </View>

              <View style={styles.tutorialRow}>
                <Text style={styles.tutorialBullet}>🔓</Text>
                <Text style={styles.tutorialRowText}>{t("quickGame.tutorial.step5")}</Text>
              </View>

              <Pressable
                style={styles.tutorialBtn}
                onPress={() => {
                  setShowTutorial(false);
                  AsyncStorage.setItem(TUTORIAL_SHOWN_KEY, "true").catch(() => {});
                }}
              >
                <Text style={styles.tutorialBtnText}>{t("quickGame.tutorial.start")}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── WIN / LOSE modal (shown over game area) ────────────────────────────────
  const isWin = phase === "win";
  const nextLevel = levels.find((l) => l.id === currentLevel.id + 1);

  // ── In-game joker state ───────────────────────────────────────────────────
  const bombLocked = currentLevel.id <= 4;
  const timeJokerDisabled = timeJokersLeft <= 0;
  const bombJokerDisabled = bombJokersLeft <= 0 || bombLocked;

  // ── PLAYING (+ win/lose as modal overlay) ─────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <StatusBar barStyle="light-content" />

      {/* Top + rope wrapper — takes all space above the fixed bottom controls */}
      <View style={styles.gameTop}>
        {/* Header — same as 1v1 */}
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              clearIntervals();
              setPhase("levels");
            }}
            style={styles.backBtn}
          >
            <Text style={styles.backText}>← {t("common.mainMenu")}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t("quickGame.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Level name row — mirrors 1v1 teamRow */}
        <View style={styles.teamRow}>
          <Text style={[styles.teamLabel, { color: playerColor }]} numberOfLines={1}>
            {t("common.you")}
          </Text>
          <Text style={styles.vsLabel}>{t("common.vs")}</Text>
          <Text
            style={[styles.teamLabel, { color: objectColor }]}
            numberOfLines={1}
          >
            {currentLevel.name}
          </Text>
        </View>

        {/* Timer row */}
        <View style={styles.timerRow}>
          <Text style={[styles.timerText, { color: timerColor }]}>
            ⏱ {timeLeft}s
          </Text>
        </View>

        {/* Rope area — identical structure to 1v1 */}
        <View style={styles.ropeArea}>
        {/* Player (left) — human avatar */}
        <Animated.View
          style={[styles.charSlot, { transform: [{ translateX: playerCharShift }] }]}
        >
          <Character
            bounceAnim={playerCharAnim}
            color={playerColor}
            fallRotate={phase === "celebrating" ? playerFallRotate : undefined}
            fallOpacity={phase === "celebrating" ? playerFallOpacity : undefined}
            victoryScale={
              phase === "celebrating" && pendingResultRef.current === "win"
                ? winnerBounceAnim
                : undefined
            }
          />
        </Animated.View>

        {/* Rope */}
        <View
          style={styles.ropeWrap}
          onLayout={(e) =>
            ropeWrapWidthAnim.setValue(e.nativeEvent.layout.width)
          }
        >
          <Animated.View
            style={[
              styles.ropeImgWrap,
              {
                left: playerCharShift,
                width: Animated.add(
                  Animated.add(
                    ropeWrapWidthAnim,
                    Animated.multiply(playerCharShift, -1),
                  ),
                  objectCharShift,
                ),
              },
            ]}
          >
            <Image
              source={ROPE_IMG}
              resizeMode="stretch"
              style={styles.ropeImg}
            />
          </Animated.View>
        </View>

        {/* Object (right) — cisim emoji */}
        <Animated.View
          style={[
            styles.charSlot,
            { transform: [{ translateX: objectCharShift }] },
          ]}
        >
          <ObjectDisplay
            emoji={currentLevel.emoji}
            image={currentLevel.image}
            bounceAnim={objectCharAnim}
            color={objectColor}
            fallRotate={phase === "celebrating" ? objectFallRotate : undefined}
            fallOpacity={phase === "celebrating" ? objectFallOpacity : undefined}
            victoryScale={
              phase === "celebrating" && pendingResultRef.current === "lose"
                ? winnerBounceAnim
                : undefined
            }
          />
        </Animated.View>

        {/* Center line */}
        <View style={styles.centerLine} pointerEvents="none" />

        {/* Progress bar — same as 1v1 */}
        <View style={styles.progressWrap} pointerEvents="none">
          <View style={styles.progressCard}>
            <View
              style={[
                styles.progressBadge,
                {
                  backgroundColor: playerColor + "22",
                  borderColor: playerColor,
                },
              ]}
            >
              <Text style={[styles.progressBadgeNum, { color: playerColor }]}>
                %{Math.round((position / WIN_THRESHOLD) * 100)}
              </Text>
              <Text style={[styles.progressBadgeLabel, { color: playerColor }]}>
                {t("quickGame.pulled")}
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFillLeft,
                  {
                    backgroundColor: playerColor,
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
                    backgroundColor: objectColor,
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

            <View
              style={[
                styles.progressBadge,
                {
                  backgroundColor: objectColor + "22",
                  borderColor: objectColor,
                },
              ]}
            >
              {currentLevel.image ? (
                <Image source={currentLevel.image} style={styles.progressBadgeImg} resizeMode="contain" />
              ) : (
                <Text style={[styles.progressBadgeNum, { color: objectColor }]}>
                  {currentLevel.emoji}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
      </View>{/* end gameTop */}

      {/* Bottom section — jokers + pull button, always visible */}
      <View style={styles.gameBottom}>
        {/* Joker row */}
        <View style={styles.jokerSection}>
          <Text style={styles.jokerSectionLabel}>{t("quickGame.jokers")}</Text>
          <View style={styles.jokerButtonsRow}>
            <Pressable
              style={[
                styles.jokerBtn,
                { width: "48%" },
                timeJokerDisabled && styles.jokerBtnUsed,
              ]}
              onPress={handleTimeJoker}
              disabled={timeJokerDisabled || phase !== "playing"}
            >
              <Text style={styles.jokerBtnText}>
                {timeJokersLeft <= 0
                  ? t("quickGame.timeJokerDone")
                  : t("quickGame.timeJoker", { count: timeJokersLeft })}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.jokerBtn,
                styles.jokerBomb,
                { width: "48%" },
                bombJokerDisabled && styles.jokerBtnUsed,
              ]}
              onPress={handleBombJoker}
              disabled={bombJokerDisabled || phase !== "playing"}
            >
              <Text style={[styles.jokerBtnText, styles.jokerBombText]}>
                {bombLocked
                  ? t("quickGame.bombLocked")
                  : bombJokersLeft <= 0
                  ? t("quickGame.bombDone")
                  : t("quickGame.bombJoker", { count: bombJokersLeft })}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Pull button */}
        <View style={{ paddingBottom: bottomInset + 16, paddingHorizontal: 20 }}>
          <Animated.View
            style={[styles.buttonWrap, { transform: [{ scale: playerPulseAnim }] }]}
          >
            <Pressable
              style={[
                styles.pullBtn,
                {
                  backgroundColor: playerColor + "22",
                  borderColor: playerColor,
                },
                phase !== "playing" && styles.pullBtnDisabled,
              ]}
              onPress={handlePull}
              disabled={phase !== "playing"}
            >
              <Text style={[styles.pullBtnText, { color: playerColor }]}>
                {t("common.pull")}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      {/* Win / Lose modal — same as 1v1 modal */}
      <Modal
        visible={phase === "win" || phase === "lose"}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.modalCard,
              isWin && {
                transform: [
                  { scale: winScaleAnim },
                  { translateY: winTranslateAnim },
                ],
              },
              !isWin && {
                transform: [{ translateX: loseShakeAnim }],
              },
            ]}
          >
            <View
              style={[
                styles.modalGlow,
                {
                  backgroundColor:
                    (isWin ? playerColor : objectColor) + "33",
                },
              ]}
            />
            <Text style={styles.modalEmoji}>{isWin ? "🏆" : "😤"}</Text>
            <Text
              style={[
                styles.modalTitle,
                { color: isWin ? playerColor : objectColor },
              ]}
            >
              {isWin ? t("quickGame.youWon") : t("quickGame.timeUp")}
            </Text>
            <Text style={[styles.modalSubtitle, currentLevel.name.length > 10 && { fontSize: 13 }]}>
              {isWin
                ? t("quickGame.winSubtitle", { name: currentLevel.name })
                : t("quickGame.loseSubtitle", { name: currentLevel.name })}
            </Text>
            {isWin && isNewRecord && (
              <Text style={styles.modalRecord}>
                {timeLeftRef.current > 0
                  ? t("quickGame.newRecord", { seconds: timeLeftRef.current })
                  : t("quickGame.newRecordLastSecond")}
              </Text>
            )}

            <View style={styles.modalBtns}>
              <Pressable
                style={styles.modalBtnMain}
                onPress={() => startGame(currentLevel)}
              >
                <Text style={styles.modalBtnMainText}>{t("quickGame.playAgain")}</Text>
              </Pressable>

              {isWin && nextLevel && (
                <Pressable
                  style={[
                    styles.modalBtnMain,
                    { backgroundColor: nextLevel.accentColor },
                  ]}
                  onPress={() => startGame(nextLevel)}
                >
                  <View style={styles.modalBtnRow}>
                    {nextLevel.image ? (
                      <Image source={nextLevel.image} style={styles.modalBtnImg} resizeMode="contain" />
                    ) : (
                      <Text style={styles.modalBtnMainText}>{nextLevel.emoji}</Text>
                    )}
                    <Text style={[styles.modalBtnMainText, { fontSize: nextLevel.name.length > 10 ? 14 : 17 }]}>
                      {t("quickGame.nextLevel", { name: nextLevel.name })}
                    </Text>
                  </View>
                </Pressable>
              )}

              {isWin && !nextLevel && (
                <Pressable
                  style={[styles.modalBtnMain, { backgroundColor: "#8b5cf6" }]}
                  onPress={() => setPhase("levels")}
                >
                  <Text style={styles.modalBtnMainText}>{t("quickGame.allComplete")}</Text>
                </Pressable>
              )}

              <View style={styles.modalBtnRow}>
                <Pressable
                  style={[styles.modalBtnSec, { flex: 1 }]}
                  onPress={() => {
                    setPhase("levels");
                  }}
                >
                  <Text style={styles.modalBtnSecText}>{t("quickGame.levelsBtn")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtnSec, { flex: 1 }]}
                  onPress={() => router.push("/")}
                >
                  <Text style={styles.modalBtnSecText}>{t("common.homePage")}</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },

  // Header — identical to 1v1
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: { padding: 10 },
  backText: { color: "#94a3b8", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: { width: 48 },

  // Team row — mirrors 1v1
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 4,
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

  // Timer
  timerRow: { alignItems: "center", marginTop: 4, marginBottom: 2 },
  timerText: { fontSize: 22, fontFamily: "Inter_700Bold" },

  // Rope area — identical to 1v1
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
  charWrap: { alignItems: "center" },
  charGlow: {
    width: 100,
    height: 100,
    borderRadius: 50,
    position: "absolute",
    opacity: 0.3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  charImage: { width: 100, height: 100 },
  objectEmoji: { fontSize: 72, textAlign: "center" },
  objectImage: { width: 100, height: 100 },
  levelEmojiImg: { width: 50, height: 50 },
  progressBadgeImg: { width: 36, height: 36 },
  gameTop: {
    flex: 1,
    overflow: "hidden",
  },
  gameBottom: {
    flexShrink: 0,
    flexGrow: 0,
  },
  jokerSection: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginBottom: 10,
    alignItems: "center",
  },
  jokerSectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#64748b",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  jokerButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  jokerBtn: {
    backgroundColor: "#fbbf2433",
    borderWidth: 2.5,
    borderColor: "#fbbf24",
    borderRadius: 24,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  jokerBomb: {
    backgroundColor: "#ef444433",
    borderColor: "#ef4444",
  },
  jokerBtnUsed: {
    backgroundColor: "#1e293b",
    borderColor: "#334155",
    borderWidth: 1.5,
    opacity: 0.4,
  },
  jokerBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fbbf24",
  },
  jokerBombText: {
    color: "#ef4444",
  },
  modalBtnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalBtnImg: { width: 28, height: 28 },

  ropeWrap: { flex: 1, height: 140, overflow: "hidden" },
  ropeImgWrap: { position: "absolute", top: 64, height: 4 },
  ropeImg: { width: "100%", height: 4 },

  centerLine: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: "#f8fafc",
    opacity: 0.15,
    marginLeft: -1,
  },

  // Progress — identical to 1v1
  progressWrap: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
  },
  progressCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  progressBadge: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 56,
    alignItems: "center",
  },
  progressBadgeNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  progressBadgeLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  progressTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#0f172a",
    flexDirection: "row",
    overflow: "visible",
    position: "relative",
  },
  progressFillLeft: { height: "100%", borderRadius: 5 },
  progressFillRight: { height: "100%", borderRadius: 5 },
  progressMarker: {
    position: "absolute",
    top: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#f8fafc",
    marginLeft: -9,
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 8,
  },

  // Pull button
  buttonWrap: { width: "100%" },
  pullBtn: {
    borderRadius: 20,
    borderWidth: 2,
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pullBtnDisabled: { opacity: 0.35 },
  pullBtnText: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },

  // Modal — identical to 1v1
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#1e293b",
    borderRadius: 28,
    padding: 32,
    width: "100%",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
    overflow: "hidden",
  },
  modalGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    borderRadius: 28,
  },
  modalEmoji: { fontSize: 64 },
  modalTitle: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  modalSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 4,
  },
  modalRecord: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fbbf24",
    textAlign: "center",
    marginBottom: 12,
  },
  modalBtns: { width: "100%", gap: 10, marginTop: 4 },
  modalBtnMain: {
    backgroundColor: "#ef4444",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  modalBtnMainText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  modalBtnSec: {
    backgroundColor: "#334155",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalBtnSecText: {
    color: "#94a3b8",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },

  // Level selection
  levelSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#64748b",
    textAlign: "center",
    marginBottom: 8,
  },
  jokerStockBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  jokerStockPill: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  jokerStockPillEmpty: {
    borderColor: "#475569",
    opacity: 0.5,
  },
  jokerStockText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#f8fafc",
  },
  jokerStockAdBtn: {
    backgroundColor: "#1e3a5f",
    borderColor: "#3b82f6",
  },
  jokerStockAdBtnDisabled: {
    backgroundColor: "#1e293b",
    borderColor: "#475569",
    opacity: 0.5,
  },
  jokerPickerBtn: {
    width: "100%",
    backgroundColor: "#1e3a5f",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#3b82f6",
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 10,
  },
  jokerPickerBtnDisabled: {
    backgroundColor: "#1e293b",
    borderColor: "#334155",
    opacity: 0.45,
  },
  jokerPickerBtnCancel: {
    backgroundColor: "transparent",
    borderColor: "#334155",
    marginBottom: 0,
  },
  jokerPickerBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#93c5fd",
  },
  tutorialOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  tutorialCard: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#334155",
    padding: 24,
    width: "100%",
    maxWidth: 360,
  },
  tutorialEmoji: {
    fontSize: 40,
    textAlign: "center",
    marginBottom: 8,
  },
  tutorialTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#f8fafc",
    textAlign: "center",
    marginBottom: 16,
  },
  tutorialRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 12,
  },
  tutorialBullet: {
    fontSize: 18,
    marginTop: 2,
  },
  tutorialRowText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#cbd5e1",
    lineHeight: 20,
  },
  tutorialBtn: {
    backgroundColor: "#ef4444",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  tutorialBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  jokerStockAdBtnLoading: {
    opacity: 0.6,
  },
  jokerStockAdText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#93c5fd",
  },
  levelList: {
    flex: 1,
    width: "100%",
  },
  levelListContent: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  levelCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  levelCardLocked: { opacity: 0.5 },
  levelEmoji: { fontSize: 38, width: 50, textAlign: "center" },
  levelCardInfo: { flex: 1 },
  levelName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#f8fafc",
    marginBottom: 2,
  },
  levelDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#64748b" },
  levelBestTime: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#fbbf24",
    marginTop: 2,
  },
  levelBadge: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 48,
    alignItems: "center",
  },
  levelBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },

  levelNumBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 40,
    alignItems: "center",
  },
  levelNumText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
