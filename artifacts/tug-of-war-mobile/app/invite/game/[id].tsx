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
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { IconSlot } from "@/components/IconSlot";
import { apiFetch } from "@/lib/api";
import { FRIENDS_ENABLED } from "@/lib/features";
import { theme } from "@/constants/theme";

export default function GameInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 16 : insets.top;
  const bottomInset = Platform.OS === "web" ? 16 : insets.bottom;
  const { ensureSession } = useAuth();
  const { t } = useTranslation();

  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!FRIENDS_ENABLED) {
      router.replace("/");
      return;
    }
    ensureSession()
      .then((session) => {
        setPlayerName(session.user.displayName);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [ensureSession]);

  if (!FRIENDS_ENABLED) {
    return null;
  }

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
      setError(err instanceof Error ? err.message : t("invite.game.joinFailed"));
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
        <IconSlot
          name="people-outline"
          size={32}
          color="#3b82f6"
          backgroundColor="#3b82f622"
          style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 8 }}
        />
        <Text style={styles.title}>{t("invite.game.title")}</Text>
        <Text style={styles.subtitle}>{t("invite.game.subtitle")}</Text>

        <TextInput
          style={styles.input}
          placeholder={t("common.usernamePlaceholder")}
          placeholderTextColor={theme.textDim}
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
            <Text style={styles.joinBtnText}>{t("invite.game.join")}</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.replace("/")} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>{t("common.cancel")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { alignItems: "center", justifyContent: "center" },
  content: { flex: 1, padding: 28, justifyContent: "center", gap: 12 },
  emoji: { fontSize: 56, textAlign: "center", marginBottom: 8 },
  title: { color: theme.text, fontFamily: theme.fonts.bold, fontSize: 28, textAlign: "center" },
  subtitle: {
    color: theme.textMuted,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    textAlign: "center",
    marginBottom: 12,
  },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    fontFamily: theme.fonts.semiBold,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  error: { color: "#f87171", fontFamily: theme.fonts.semiBold, fontSize: 14, textAlign: "center" },
  joinBtn: {
    backgroundColor: theme.modes.oneVsOne,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  joinBtnPressed: { opacity: 0.85 },
  joinBtnDisabled: { opacity: 0.5 },
  joinBtnText: { color: "#fff", fontFamily: theme.fonts.bold, fontSize: 16 },
  cancelBtn: { paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { color: theme.textDim, fontFamily: theme.fonts.semiBold, fontSize: 15 },
});
