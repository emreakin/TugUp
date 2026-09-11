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
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SubtleBannerSlot } from "@/components/HomeBannerAd";
import { AppIcon, CrownIcon, TrophyIcon } from "@/components/AppIcon";
import { IconSlot } from "@/components/IconSlot";
import { getApiBase, getApiHeaders } from "@/lib/api";
import { theme } from "@/constants/theme";

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

const ONBOARDING_STEP_KEYS = [
  { title: "online.onboarding.step1Title", text: "online.onboarding.step1Text" },
  { title: "online.onboarding.step2Title", text: "online.onboarding.step2Text" },
  { title: "online.onboarding.step3Title", text: "online.onboarding.step3Text" },
  { title: "online.onboarding.step4Title", text: "online.onboarding.step4Text" },
] as const;

export default function OnlineScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const steps = ONBOARDING_STEP_KEYS.map((step) => ({
    title: t(step.title),
    text: t(step.text),
  }));

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
      const res = await fetch(`${getApiBase()}/matchups`, {
        headers: getApiHeaders({}, { json: false }),
      });
      if (res.ok) setMatchups(await res.json());
    } catch { /* ignore */ } finally {
      setMatchupsLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/suggestions`, {
        headers: getApiHeaders({}, { json: false }),
      });
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
    if (onboardingStep < steps.length - 1) {
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
      Alert.alert(t("online.alerts.missingInfoTitle"), t("online.alerts.missingInfoMessage"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/suggestions`, {
        method: "POST",
        headers: getApiHeaders(),
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
        Alert.alert(t("common.error"), t("online.alerts.submitFailed"));
      }
    } catch {
      Alert.alert(t("common.error"), t("online.alerts.connectionError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteSuggestion = async (id: number) => {
    const s = suggestions.find((x) => x.id === id);
    if (!s || s.hasVoted) return;
    setVotingId(id);
    try {
      const res = await fetch(`${getApiBase()}/suggestions/${id}/vote`, {
        method: "POST",
        headers: getApiHeaders(),
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
      Alert.alert(t("common.error"), t("online.alerts.connectionError"));
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
            <Text style={styles.backText}>← {t("common.mainMenu")}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t("home.modes.online")}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>{t("online.title")}</Text>
          <Text style={styles.subtitle}>{t("online.subtitle")}</Text>
        </View>

        {/* Matchup list — only active; pending/inactive hidden */}
        {matchupsLoading ? (
          <ActivityIndicator color="#ef4444" style={{ marginVertical: 32 }} />
        ) : (
          <View style={styles.list}>
            {matchups
              .filter((m) => m.isActive)
              .map((m) => {
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
                    <IconSlot
                      name="git-compare-outline"
                      size={22}
                      color={theme.textMuted}
                      backgroundColor={theme.bg}
                    />
                    <View style={styles.cardMiddle}>
                      <View style={styles.teamNameRow}>
                        {leftLeads ? <CrownIcon size={12} /> : null}
                        <Text style={[styles.teamName, { color: m.leftColor, textAlign: "center" }]}>
                          {m.leftTeam}
                        </Text>
                      </View>
                      <Text style={styles.vsText}>{t("common.vs")}</Text>
                      <View style={styles.teamNameRow}>
                        <Text style={[styles.teamName, { color: m.rightColor, textAlign: "center" }]}>
                          {m.rightTeam}
                        </Text>
                        {rightLeads ? <CrownIcon size={12} /> : null}
                      </View>
                    </View>
                    <Feather name="chevron-right" size={20} color={theme.textDim} />
                  </Pressable>
                );
              })}
          </View>
        )}

        {/* Mücadele Öner — geçici olarak gizli (kod açık kalsın) */}
        {false && (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>{t("online.suggestSection")}</Text>
            <View style={styles.suggestForm}>
              <TextInput
                style={styles.input}
                placeholderTextColor={theme.textDim}
                value={leftTeam}
                onChangeText={setLeftTeam}
                maxLength={50}
              />
              <Text style={styles.formVs}>{t("common.vs")}</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={theme.textDim}
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
                  <Text style={styles.submitBtnText}>{t("online.submit")}</Text>
                )}
              </Pressable>
            </View>

            {suggestionsLoading ? (
              <ActivityIndicator color="#ef4444" style={{ marginTop: 24 }} />
            ) : suggestions.length === 0 ? (
              <Text style={styles.emptyText}>{t("online.emptySuggestions")}</Text>
            ) : (
              <View style={[styles.list, { marginTop: 16 }]}>
                {suggestions.map((s) => (
                  <View key={s.id} style={styles.suggestionCard}>
                    <View style={styles.suggestionMiddle}>
                      <Text style={styles.suggestionTeam}>{s.leftTeam}</Text>
                      <Text style={styles.vsText}>{t("common.vs")}</Text>
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
              {onboardingStep + 1} / {steps.length}
            </Text>
            <Text style={styles.onboardingTitle}>{steps[onboardingStep].title}</Text>
            <Text style={styles.onboardingText}>{steps[onboardingStep].text}</Text>

            <View style={styles.onboardingDots}>
              {steps.map((_, i) => (
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
              {onboardingStep < steps.length - 1 ? (
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

      <SubtleBannerSlot />
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: theme.bg,
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
    fontFamily: theme.fonts.semiBold,
    color: theme.textMuted,
  },
  headerTitle: {
    color: theme.text,
    fontSize: 18,
    fontFamily: theme.fonts.bold,
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 70,
  },
  title: {
    fontSize: 40,
    fontFamily: theme.fonts.bold,
    color: "#ef4444",
    letterSpacing: 2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: theme.fonts.semiBold,
    color: theme.textDim,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  list: {
    gap: 14,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    gap: 14,
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  cardInactive: {
    opacity: 0.45,
    backgroundColor: theme.surface,
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
    fontFamily: theme.fonts.bold,
  },
  teamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  vsText: {
    fontSize: 12,
    fontFamily: theme.fonts.semiBold,
    color: theme.textDim,
  },
  divider: {
    height: 1,
    backgroundColor: theme.surface,
    marginVertical: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: theme.fonts.semiBold,
    color: theme.textDim,
    letterSpacing: 3,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 20,
  },
  suggestForm: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  input: {
    backgroundColor: theme.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#f1f5f9",
    fontSize: 16,
    fontFamily: theme.fonts.semiBold,
  },
  formVs: {
    fontSize: 13,
    fontFamily: theme.fonts.semiBold,
    color: theme.textDim,
    textAlign: "center",
    letterSpacing: 2,
  },
  submitBtn: {
    backgroundColor: theme.ember,
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
    fontFamily: theme.fonts.bold,
    letterSpacing: 2,
  },
  emptyText: {
    color: theme.textDim,
    fontFamily: theme.fonts.semiBold,
    fontSize: 14,
    textAlign: "center",
    marginTop: 24,
  },
  suggestionCard: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
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
    fontFamily: theme.fonts.bold,
    color: "#f1f5f9",
    textAlign: "center",
  },
  voteBtn: {
    backgroundColor: theme.border,
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
    fontFamily: theme.fonts.bold,
    textAlign: "center",
  },
  voteBtnCount: {
    color: "#f1f5f9",
    fontSize: 14,
    fontFamily: theme.fonts.bold,
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
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: theme.border,
  },
  onboardingStepCount: {
    fontSize: 13,
    fontFamily: theme.fonts.semiBold,
    color: theme.textDim,
    marginBottom: 8,
  },
  onboardingTitle: {
    fontSize: 22,
    fontFamily: theme.fonts.bold,
    color: theme.text,
    marginBottom: 12,
  },
  onboardingText: {
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    color: theme.textMuted,
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
    backgroundColor: theme.border,
  },
  onboardingDotActive: {
    backgroundColor: theme.ember,
    width: 20,
  },
  onboardingButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  onboardingBtnPrimary: {
    flex: 1,
    backgroundColor: theme.ember,
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
    borderColor: theme.border,
  },
  onboardingBtnPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: theme.fonts.bold,
  },
  onboardingBtnSecondaryText: {
    color: theme.textMuted,
    fontSize: 15,
    fontFamily: theme.fonts.semiBold,
  },
});
