import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/contexts/LocaleContext";
import type { AppLanguage } from "@/lib/i18n";

const LANGUAGES: { code: AppLanguage; flag: string; label: string }[] = [
  { code: "tr", flag: "🇹🇷", label: "TR" },
  { code: "en", flag: "🇬🇧", label: "EN" },
];

export function LanguageSwitch() {
  const { i18n } = useTranslation();
  const { setPreference } = useLocale();
  const active: AppLanguage = i18n.language.startsWith("tr") ? "tr" : "en";

  return (
    <View style={styles.container}>
      {LANGUAGES.map((lang) => {
        const selected = active === lang.code;
        return (
          <Pressable
            key={lang.code}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => setPreference(lang.code)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={lang.label}
          >
            <Text style={styles.flag}>{lang.flag}</Text>
            <Text style={[styles.label, selected && styles.labelSelected]}>{lang.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 3,
    gap: 2,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 11,
  },
  optionSelected: {
    backgroundColor: "#334155",
  },
  flag: {
    fontSize: 16,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#64748b",
  },
  labelSelected: {
    color: "#f8fafc",
  },
});
