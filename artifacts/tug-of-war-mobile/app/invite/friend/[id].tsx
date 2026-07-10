import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

export default function FriendInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 16 : insets.top;
  const { token, ensureSession } = useAuth();
  const { t } = useTranslation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage(t("invite.friend.processing"));
  }, [t]);

  useEffect(() => {
    if (!id) {
      setStatus("error");
      setMessage(t("invite.friend.invalidLink"));
      return;
    }

    (async () => {
      try {
        const session = await ensureSession();
        const result = await apiFetch<{ accepted: boolean; friend: { displayName: string } | null }>(
          `/api/friends/accept/${id}`,
          { method: "POST", token: session.token },
        );
        setStatus("success");
        setMessage(
          result.friend
            ? t("invite.friend.successWithName", { name: result.friend.displayName })
            : t("invite.friend.successGeneric"),
        );
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : t("invite.friend.acceptFailed"));
      }
    })();
  }, [id, ensureSession, token, t]);

  const title =
    status === "loading"
      ? t("invite.friend.titleLoading")
      : status === "success"
        ? t("invite.friend.titleSuccess")
        : t("invite.friend.titleError");

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        {status === "loading" ? (
          <ActivityIndicator size="large" color="#3b82f6" />
        ) : (
          <Text style={styles.emoji}>{status === "success" ? "🎉" : "😕"}</Text>
        )}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        {status !== "loading" && (
          <View style={styles.actions}>
            <Pressable style={styles.primaryBtn} onPress={() => router.replace("/friends")}>
              <Text style={styles.primaryBtnText}>{t("invite.friend.goToFriends")}</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => router.replace("/")}>
              <Text style={styles.secondaryBtnText}>{t("common.mainMenu")}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emoji: { fontSize: 56, marginBottom: 8 },
  title: { color: "#f8fafc", fontFamily: "Inter_700Bold", fontSize: 24 },
  message: {
    color: "#94a3b8",
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  actions: { width: "100%", gap: 12, marginTop: 8 },
  primaryBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  secondaryBtnText: { color: "#94a3b8", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
