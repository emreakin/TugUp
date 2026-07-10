import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, type FriendSummary } from "@/lib/api";

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const topInset = Platform.OS === "web" ? 16 : insets.top;
  const bottomInset = Platform.OS === "web" ? 16 : insets.bottom;
  const { token, user, ensureSession } = useAuth();

  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const loadFriends = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch<FriendSummary[]>("/api/friends", { token });
      setFriends(data);
    } catch {
      setFriends([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    ensureSession()
      .then(() => loadFriends())
      .catch(() => setLoading(false));
  }, [ensureSession, loadFriends]);

  const shareInviteLink = async () => {
    if (!token) return;
    setSharing(true);
    try {
      const data = await apiFetch<{
        url: string;
        shareMessage: string;
      }>("/api/friends/invite-link", {
        method: "POST",
        token,
      });
      await Share.share({
        message: data.shareMessage,
        url: data.url,
      });
    } catch (err) {
      Alert.alert(t("common.error"), err instanceof Error ? err.message : t("friends.inviteFailed"));
    } finally {
      setSharing(false);
    }
  };

  const removeFriend = (friend: FriendSummary) => {
    Alert.alert(
      t("friends.removeTitle"),
      t("friends.removeMessage", { name: friend.displayName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.remove"),
          style: "destructive",
          onPress: async () => {
            if (!token) return;
            try {
              await apiFetch(`/api/friends/${friend.id}`, {
                method: "DELETE",
                token,
              });
              setFriends((prev) => prev.filter((f) => f.id !== friend.id));
            } catch (err) {
              Alert.alert(t("common.error"), err instanceof Error ? err.message : t("friends.actionFailed"));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← {t("common.back")}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t("friends.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <Text style={styles.profileLabel}>{t("friends.you")}</Text>
          <Text style={styles.profileName}>{user?.displayName ?? t("common.player")}</Text>
          <Text style={styles.profileCode}>{t("friends.code", { code: user?.friendCode ?? "—" })}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.inviteBtn, pressed && styles.inviteBtnPressed]}
          onPress={shareInviteLink}
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="link" size={20} color="#fff" />
              <Text style={styles.inviteBtnText}>{t("friends.shareInviteLink")}</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.sectionTitle}>{t("friends.friendsCount", { count: friends.length })}</Text>

        {loading ? (
          <ActivityIndicator color="#3b82f6" style={{ marginTop: 24 }} />
        ) : friends.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>👋</Text>
            <Text style={styles.emptyTitle}>{t("friends.emptyTitle")}</Text>
            <Text style={styles.emptyText}>{t("friends.emptyText")}</Text>
          </View>
        ) : (
          friends.map((friend) => (
            <View key={friend.id} style={styles.friendRow}>
              <View style={styles.friendAvatar}>
                <Text style={styles.friendAvatarText}>
                  {friend.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.friendInfo}>
                <Text style={styles.friendName}>{friend.displayName}</Text>
                <Text style={styles.friendCode}>{friend.friendCode}</Text>
              </View>
              <Pressable onPress={() => removeFriend(friend)} style={styles.removeBtn}>
                <Feather name="user-minus" size={18} color="#f87171" />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { paddingVertical: 8, paddingRight: 12 },
  backText: { color: "#94a3b8", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#f8fafc",
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  headerSpacer: { width: 72 },
  content: { padding: 20, gap: 16 },
  profileCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  profileLabel: { color: "#64748b", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  profileName: { color: "#f8fafc", fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 4 },
  profileCode: { color: "#94a3b8", fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 4 },
  inviteBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  inviteBtnPressed: { opacity: 0.85 },
  inviteBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  sectionTitle: {
    color: "#94a3b8",
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 1,
    marginTop: 8,
  },
  emptyBox: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: "#f8fafc", fontFamily: "Inter_700Bold", fontSize: 18 },
  emptyText: {
    color: "#94a3b8",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 12,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  friendAvatarText: { color: "#f8fafc", fontFamily: "Inter_700Bold", fontSize: 18 },
  friendInfo: { flex: 1 },
  friendName: { color: "#f8fafc", fontFamily: "Inter_700Bold", fontSize: 16 },
  friendCode: { color: "#64748b", fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 2 },
  removeBtn: { padding: 8 },
});
