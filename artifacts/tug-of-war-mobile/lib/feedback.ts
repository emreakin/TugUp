import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

type SfxKey = "pull" | "tick" | "win" | "lose";

const SFX_SOURCES: Record<SfxKey, number> = {
  pull: require("@/assets/sounds/pull.wav"),
  tick: require("@/assets/sounds/tick.wav"),
  win: require("@/assets/sounds/win.wav"),
  lose: require("@/assets/sounds/lose.wav"),
};

const VOLUME: Record<SfxKey, number> = {
  pull: 0.55,
  tick: 0.4,
  win: 0.7,
  lose: 0.65,
};

let ready = false;
let loading: Promise<void> | null = null;
const sounds: Partial<Record<SfxKey, Audio.Sound>> = {};
let lastPullAt = 0;

async function ensureReady() {
  if (ready) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      await Promise.all(
        (Object.keys(SFX_SOURCES) as SfxKey[]).map(async (key) => {
          const { sound } = await Audio.Sound.createAsync(SFX_SOURCES[key], {
            volume: VOLUME[key],
            shouldPlay: false,
          });
          sounds[key] = sound;
        }),
      );
      ready = true;
    } catch {
      // Web / missing audio — haptics alone still work
      ready = true;
    }
  })();
  return loading;
}

async function playSfx(key: SfxKey) {
  try {
    await ensureReady();
    const sound = sounds[key];
    if (!sound) return;
    await sound.replayAsync();
  } catch {
    // ignore playback errors
  }
}

async function haptic(
  kind: "light" | "medium" | "heavy" | "success" | "warning" | "error",
) {
  if (Platform.OS === "web") return;
  try {
    switch (kind) {
      case "light":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "medium":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "heavy":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case "success":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "warning":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "error":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // device without haptics
  }
}

/** Prefetch sounds (call once from a game screen mount). */
export function preloadFeedback() {
  void ensureReady();
}

/** Each tug / swipe pull. Light haptic + short thud; soft SFX throttle. */
export function feedbackPull() {
  const now = Date.now();
  void haptic("light");
  if (now - lastPullAt < 45) return;
  lastPullAt = now;
  void playSfx("pull");
}

/** Countdown second tick (1v1) or urgent timer tick (quick game). */
export function feedbackTick(urgent = false) {
  void haptic(urgent ? "warning" : "medium");
  void playSfx("tick");
}

/** Match / level win. */
export function feedbackWin() {
  void haptic("success");
  void playSfx("win");
}

/** Match / level lose. */
export function feedbackLose() {
  void haptic("error");
  void playSfx("lose");
}
