import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLocale } from "@/contexts/LocaleContext";
import type { LanguagePreference } from "@/lib/i18n";

const LANGUAGE_OPTIONS: {
  value: LanguagePreference;
  labelKey: "settings.languageSystem" | "settings.languageTurkish" | "settings.languageEnglish";
}[] = [
  { value: "system", labelKey: "settings.languageSystem" },
  { value: "tr", labelKey: "settings.languageTurkish" },
  { value: "en", labelKey: "settings.languageEnglish" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { preference, setPreference } = useLocale();

  const topInset = Platform.OS === "web" ? 16 : insets.top;
  const bottomInset = Platform.OS === "web" ? 16 : insets.bottom;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: topInset, paddingBottom: bottomInset },
      ]}
    >
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#94a3b8" />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("settings.title")}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.language")}</Text>
        <View style={styles.optionList}>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = preference === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.optionRow, selected && styles.optionRowSelected]}
                onPress={() => setPreference(option.value)}
              >
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                  {t(option.labelKey)}
                </Text>
                {selected ? (
                  <Feather name="check" size={18} color="#38bdf8" />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 28,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  backText: {
    color: "#94a3b8",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  title: {
    color: "#f8fafc",
    fontFamily: "Inter_700Bold",
    fontSize: 28,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: "#64748b",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  optionList: {
    gap: 10,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  optionRowSelected: {
    borderColor: "#38bdf8",
    backgroundColor: "#172554",
  },
  optionLabel: {
    color: "#cbd5e1",
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  optionLabelSelected: {
    color: "#f8fafc",
  },
});
