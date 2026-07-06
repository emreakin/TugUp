import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ??
  (process.env.EXPO_PUBLIC_REPLIT_DEV_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_REPLIT_DEV_DOMAIN}`
    : "https://72a67990-7136-40a7-a2ca-48f1c4842176-00-26avhjd9y0o9l.janeway.replit.dev");

interface Matchup {
  id: string;
  leftTeam: string;
  rightTeam: string;
  leftColor: string;
  rightColor: string;
  emoji: string;
  leftWins: number;
  rightWins: number;
  isActive: boolean;
}

interface Suggestion {
  id: number;
  leftTeam: string;
  rightTeam: string;
  votes: number;
  hasVoted: boolean;
}

const ONBOARDING_KEY = "@tugup_onboarding_online_done";

const STEPS = [
  {
    title: "\ud83c\udf0d Online Oylama",
    text:
      "TugUp'un kalbi burada! Dünyanın en büyük mücadelelerini (Galatasaray vs Fenerbahçe, Android vs iOS...) seç ve desteklediğin taraf için halatı çekerek skora katkı sağla.",
  },
  {
    title: "\ud83c\udfa9 Nasıl Oynanır?",
    text:
      "Bir mücadele seç, ekranda beliren halatı tarafın rengiyle eşleşen butona tıklayarak çek. Her oy verdiğinde halat o tarafa doğru kayar. Rakip tarafın da oy verdiğini unutma!",
  },
  {
    title: "\u23f3 Bekleme Sistemi",
    text:
      "Her oy verişten sonra kısa bir bekleme süresi başlar. Video izleyerek (Ödüllü Reklam) bu süreyi atlayabilir ve tekrar oy verebilirsin.",
  },
  {
    title: "\ud83d\uddd3 Haftalık Sıfırlama",
    text:
      "Her hafta Pazartesi başlangıcında tüm skorlar sıfırlanır. Hafta boyunca en çok oy alan taraf o haftanın galibi olur ve kümülatif bir galibiyet puanı kazanır.",
  },
];

export default function OnlineScreen() {
  const insets = useSafeAreaInsets();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [matchupsLoading, setMatchupsLoading] = useState(true);

  const [leftTeam, setLeftTeam] = useState("");
  const [rightTeam, setRightTeam] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [votingId, setVotingId] = useState<number | null>(null);

  const fetchMatchups = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/matchups`);
      if (res.ok) setMatchups(await res.json());
    } catch { /* ignore */ } finally {
      setMatchupsLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/suggestions`);
      if (res.ok) setSuggestions(await res.json());
    } catch { /* ignore */ } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatchups();
    fetchSuggestions();
  }, [fetchMatchups, fetchSuggestions]);

  // Check onboarding on first mount
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((done) => {
        if (!done) setShowOnboarding(true);
      })
      .catch(() => {});
  }, []);

  const handleOnboardingNext = () => {
    if (onboardingStep < STEPS.length - 1) {
      setOnboardingStep(onboardingStep + 1);
    } else {
      setShowOnboarding(false);
      AsyncStorage.setItem(ONBOARDING_KEY, "done").catch(() => {});
    }
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_KEY, "done").catch(() => {});
  };

  const handleSelect = (m: Matchup) => {
    if (!m.isActive) return;
    router.push({
      pathname: "/game",
      params: {
        matchupId: m.id,
        left: m.leftTeam,
        right: m.rightTeam,
        leftColor: m.leftColor,
        rightColor: m.rightColor,
        emoji: m.emoji,
        leftWins: String(m.leftWins),
        rightWins: String(m.rightWins),
      },
    });
  };

  const handleSubmitSuggestion = async () => {
    const l = leftTeam.trim();
    const r = rightTeam.trim();
    if (!l || !r) {
      Alert.alert("Eksik Bilgi", "Her iki tarafı da doldurmalısın.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leftTeam: l, rightTeam: r }),
      });
      if (res.ok) {
        const created: Suggestion = await res.json();
        setSuggestions((prev) =>
          [created, ...prev].sort((a, b) => b.votes - a.votes),
        );
        setLeftTeam("");
        setRightTeam("");
      } else {
        Alert.alert("Hata", "Öneri gönderilemedi.");
      }
    } catch {
      Alert.alert("Hata", "Bağlantı sorunu.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteSuggestion = async (id: number) => {
    const s = suggestions.find((x) => x.id === id);
    if (!s || s.hasVoted) return;
    setVotingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/suggestions/${id}/vote`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.accepted) {
          setSuggestions((prev) =>
            prev
              .map((x) =>
                x.id === id ? { ...x, votes: x.votes + 1, hasVoted: true } : x,
              )
              .sort((a, b) => b.votes - a.votes),
          );
        } else {
          setSuggestions((prev) =>
            prev.map((x) => (x.id === id ? { ...x, hasVoted: true } : x)),
          );
        }
      }
    } catch {
      Alert.alert("Hata", "Bağlantı sorunu.");
    } finally {
      setVotingId(null);
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Ana Menü</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Online</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>TUG OF WAR</Text>
          <Text style={styles.subtitle}>Mücadele Seç</Text>
        </View>

        {/* Matchup list */}
        {matchupsLoading ? (
          <ActivityIndicator color="#ef4444" style={{ marginVertical: 32 }} />
        ) : (() => {
          const active = matchups.filter((m) => m.isActive);
          const inactive = matchups.filter((m) => !m.isActive);
          return (
            <>
              <View style={styles.list}>
                {active.map((m) => {
                  const leftLeads = m.leftWins > m.rightWins;
                  const rightLeads = m.rightWins > m.leftWins;
                  return (
                    <Pressable
                      key={m.id}
                      style={({ pressed }) => [
                        styles.card,
                        pressed && styles.cardPressed,
                      ]}
                      onPress={() => handleSelect(m)}
                    >
                      <Text style={styles.cardEmoji}>{m.emoji}</Text>
                      <View style={styles.cardMiddle}>
                        <Text style={[styles.teamName, { color: m.leftColor, textAlign: "center" }]}>
                          {leftLeads ? "👑 " : ""}{m.leftTeam}
                        </Text>
                        <Text style={styles.vsText}>vs</Text>
                        <Text style={[styles.teamName, { color: m.rightColor, textAlign: "center" }]}>
                          {m.rightTeam}{rightLeads ? " 👑" : ""}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={20} color="#475569" />
                    </Pressable>
                  );
                })}
              </View>

              {inactive.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionTitle}>BEKLEMEDEKİLER</Text>
                  <View style={styles.list}>
                    {inactive.map((m) => (
                      <View key={m.id} style={[styles.card, styles.cardInactive]}>
                        <Text style={[styles.cardEmoji, styles.cardEmojiInactive]}>{m.emoji}</Text>
                        <View style={styles.cardMiddle}>
                          <Text style={[styles.teamName, { color: m.leftColor, textAlign: "center" }, styles.teamNameInactive]}>
                            {m.leftTeam}
                          </Text>
                          <Text style={styles.vsText}>vs</Text>
                          <Text style={[styles.teamName, { color: m.rightColor, textAlign: "center" }, styles.teamNameInactive]}>
                            {m.rightTeam}
                          </Text>
                        </View>
                        <Text style={styles.inactiveBadge}>⏳</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          );
        })()}

        {/* Mücadele Öner — geçici olarak gizli (kod açık kalsın) */}
        {false && (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>MÜCADELE ÖNER</Text>
            <View style={styles.suggestForm}>
              <TextInput
                style={styles.input}
                placeholderTextColor="#475569"
                value={leftTeam}
                onChangeText={setLeftTeam}
                maxLength={50}
              />
              <Text style={styles.formVs}>vs</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor="#475569"
                value={rightTeam}
                onChangeText={setRightTeam}
                maxLength={50}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  (pressed || submitting) && styles.submitBtnPressed,
                ]}
                onPress={handleSubmitSuggestion}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>TALEP ET</Text>
                )}
              </Pressable>
            </View>

            {suggestionsLoading ? (
              <ActivityIndicator color="#ef4444" style={{ marginTop: 24 }} />
            ) : suggestions.length === 0 ? (
              <Text style={styles.emptyText}>Henüz öneri yok. İlk sen öner!</Text>
            ) : (
              <View style={[styles.list, { marginTop: 16 }]}>
                {suggestions.map((s) => (
                  <View key={s.id} style={styles.suggestionCard}>
                    <View style={styles.suggestionMiddle}>
                      <Text style={styles.suggestionTeam}>{s.leftTeam}</Text>
                      <Text style={styles.vsText}>vs</Text>
                      <Text style={styles.suggestionTeam}>{s.rightTeam}</Text>
                    </View>
                    <Pressable
                      style={[
                        styles.voteBtn,
                        s.hasVoted && styles.voteBtnVoted,
                      ]}
                      onPress={() => handleVoteSuggestion(s.id)}
                      disabled={s.hasVoted || votingId === s.id}
                    >
                      {votingId === s.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Text style={styles.voteBtnIcon}>
                            {s.hasVoted ? "✓" : "▲"}
                          </Text>
                          <Text style={styles.voteBtnCount}>{s.votes}</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Onboarding Modal */}
      <Modal visible={showOnboarding} transparent animationType="fade">
        <View style={styles.onboardingOverlay}>
          <View style={styles.onboardingCard}>
            <Text style={styles.onboardingStepCount}>
              {onboardingStep + 1} / {STEPS.length}
            </Text>
            <Text style={styles.onboardingTitle}>{STEPS[onboardingStep].title}</Text>
            <Text style={styles.onboardingText}>{STEPS[onboardingStep].text}</Text>

            <View style={styles.onboardingDots}>
              {STEPS.map((_, i) => (
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
              {onboardingStep < STEPS.length - 1 ? (
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

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
  },
  titleSection: {
    alignItems: "center",
    marginBottom: 36,
    position: "relative",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    padding: 10,
  },
  backText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#94a3b8",
  },
  headerTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 70,
  },
  title: {
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    color: "#ef4444",
    letterSpacing: 2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#475569",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  list: {
    gap: 14,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 18,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
    gap: 14,
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  cardInactive: {
    opacity: 0.45,
    backgroundColor: "#1e293b",
  },
  cardEmoji: {
    fontSize: 28,
  },
  cardEmojiInactive: {
    opacity: 0.5,
  },
  teamNameInactive: {
    opacity: 0.5,
  },
  inactiveBadge: {
    fontSize: 18,
    marginLeft: 4,
  },
  cardMiddle: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  teamName: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  vsText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#475569",
  },
  divider: {
    height: 1,
    backgroundColor: "#1e293b",
    marginVertical: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#475569",
    letterSpacing: 3,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 20,
  },
  suggestForm: {
    backgroundColor: "#1e293b",
    borderRadius: 18,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#f1f5f9",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  formVs: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#475569",
    textAlign: "center",
    letterSpacing: 2,
  },
  submitBtn: {
    backgroundColor: "#ef4444",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitBtnPressed: {
    opacity: 0.75,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  emptyText: {
    color: "#475569",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    textAlign: "center",
    marginTop: 24,
  },
  suggestionCard: {
    backgroundColor: "#1e293b",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
    gap: 12,
  },
  suggestionMiddle: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  suggestionTeam: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#f1f5f9",
    textAlign: "center",
  },
  voteBtn: {
    backgroundColor: "#334155",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    minWidth: 52,
  },
  voteBtnVoted: {
    backgroundColor: "#166534",
  },
  voteBtnIcon: {
    color: "#f1f5f9",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  voteBtnCount: {
    color: "#f1f5f9",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  // Onboarding styles
  onboardingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  onboardingCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "#334155",
  },
  onboardingStepCount: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#64748b",
    marginBottom: 8,
  },
  onboardingTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#f8fafc",
    marginBottom: 12,
  },
  onboardingText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#cbd5e1",
    lineHeight: 22,
    marginBottom: 24,
  },
  onboardingDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
  onboardingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#334155",
  },
  onboardingDotActive: {
    backgroundColor: "#ef4444",
    width: 20,
  },
  onboardingButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  onboardingBtnPrimary: {
    flex: 1,
    backgroundColor: "#ef4444",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  onboardingBtnSecondary: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  onboardingBtnPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  onboardingBtnSecondaryText: {
    color: "#94a3b8",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
