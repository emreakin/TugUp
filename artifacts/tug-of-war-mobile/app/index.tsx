import { router } from "expo-router";
import React from "react";
import {
  Dimensions,
  Image,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

const MODE_CONFIG = [
  {
    key: "quick" as const,
    label: "Quick Game",
    emoji: "⚡",
    color: "#ef4444",
    gradient: ["#ef4444", "#dc2626"],
  },
  {
    key: "1v1" as const,
    label: "1v1",
    emoji: "👥",
    color: "#3b82f6",
    gradient: ["#3b82f6", "#2563eb"],
  },
  {
    key: "online" as const,
    label: "Online",
    emoji: "🌐",
    color: "#10b981",
    gradient: ["#10b981", "#059669"],
  },
] as const;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  const handlePress = (key: (typeof MODE_CONFIG)[number]["key"]) => {
    if (key === "online") {
      router.push("/online");
    } else if (key === "1v1") {
      router.push("/1v1");
    } else if (key === "quick") {
      router.push("/quick-game");
    }
  };

  return (
    <View
      style={[
        styles.outerContainer,
        {
          paddingTop: Platform.OS === "web" ? 0 : insets.top,
          paddingBottom: Platform.OS === "web" ? 0 : insets.bottom,
        },
      ]}
    >
      <StatusBar barStyle="light-content" />

      {/* Logo area */}
      <View style={styles.header}>
        <Image
          source={require("../assets/images/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brand}>TugUp</Text>
        <Text style={styles.tagline}>Dünyanın en büyük gücünü belirle!</Text>
      </View>

      {/* Mode buttons */}
      <View style={styles.buttonList}>
        {MODE_CONFIG.map((mode) => (
          <Pressable
            key={mode.key}
            style={({ pressed }) => [
              styles.modeButton,
              { backgroundColor: mode.color },
              pressed && styles.modeButtonPressed,
            ]}
            onPress={() => handlePress(mode.key)}
          >
            <Text style={styles.modeEmoji}>{mode.emoji}</Text>
            <Text style={styles.modeLabel}>{mode.label}</Text>
            <Text style={styles.modeArrow}>›</Text>
          </Pressable>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable style={styles.friendsBtn} onPress={() => router.push("/friends")}>
          <Text style={styles.friendsBtnText}>👥 Arkadaşlar</Text>
        </Pressable>
        <Text style={styles.footerText}>v0.0.6 · TugUp</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  header: {
    alignItems: "center",
    marginTop: 48,
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 32,
    marginBottom: 16,
  },
  brand: {
    fontSize: 48,
    fontFamily: "Inter_700Bold",
    color: "#f8fafc",
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#64748b",
    marginTop: 6,
    textAlign: "center",
  },
  buttonList: {
    width: "100%",
    gap: 16,
    marginTop: 20,
  },
  modeButton: {
    width: "100%",
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modeButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  modeEmoji: {
    fontSize: 28,
    width: 40,
    textAlign: "center",
  },
  modeLabel: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
  modeArrow: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.6)",
  },
  footer: {
    marginBottom: 24,
    alignItems: "center",
    gap: 12,
  },
  friendsBtn: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: "#334155",
  },
  friendsBtnText: {
    color: "#94a3b8",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  footerText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#475569",
    letterSpacing: 1,
  },
});
