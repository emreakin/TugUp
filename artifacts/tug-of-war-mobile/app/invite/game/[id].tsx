import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

export default function GameInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 16 : insets.top;
  const bottomInset = Platform.OS === "web" ? 16 : insets.bottom;
  const { ensureSession } = useAuth();

  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureSession()
      .then((session) => {
        setPlayerName(session.user.displayName);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [ensureSession]);

  const joinGame = async () => {
    if (!id || !playerName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const session = await ensureSession(playerName.trim());
      const data = await apiFetch<{
        roomId: string;
        side: "left" | "right";
        status: string;
        opponentName: string | null;
        playerToken: string;
      }>(`/api/game/join-invite/${id}`, {
        method: "POST",
        token: session.token,
        body: JSON.stringify({ name: playerName.trim() }),
      });

      router.replace({
        pathname: "/1v1",
        params: {
          joinRoomId: data.roomId,
          joinSide: data.side,
          joinStatus: data.status,
          joinOpponent: data.opponentName ?? "",
          joinPlayerToken: data.playerToken,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oyuna katılınamadı.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <Text style={styles.emoji}>⚔️</Text>
        <Text style={styles.title}>1v1 Daveti</Text>
        <Text style={styles.subtitle}>Arkadaşın seni halat çekmeye davet etti!</Text>

        <TextInput
          style={styles.input}
          placeholder="Kullanıcı Adı"
          placeholderTextColor="#475569"
          value={playerName}
          onChangeText={setPlayerName}
          maxLength={24}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.joinBtn,
            pressed && styles.joinBtnPressed,
            (!playerName.trim() || loading) && styles.joinBtnDisabled,
          ]}
          onPress={joinGame}
          disabled={!playerName.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.joinBtnText}>Oyuna Katıl</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.replace("/")} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>İptal</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  centered: { alignItems: "center", justifyContent: "center" },
  content: { flex: 1, padding: 28, justifyContent: "center", gap: 12 },
  emoji: { fontSize: 56, textAlign: "center", marginBottom: 8 },
  title: { color: "#f8fafc", fontFamily: "Inter_700Bold", fontSize: 28, textAlign: "center" },
  subtitle: {
    color: "#94a3b8",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    color: "#f8fafc",
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  error: { color: "#f87171", fontFamily: "Inter_600SemiBold", fontSize: 14, textAlign: "center" },
  joinBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  joinBtnPressed: { opacity: 0.85 },
  joinBtnDisabled: { opacity: 0.5 },
  joinBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  cancelBtn: { paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { color: "#64748b", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
