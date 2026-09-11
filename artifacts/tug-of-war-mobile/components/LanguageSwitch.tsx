import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { theme } from "@/constants/theme";
import { useLocale } from "@/contexts/LocaleContext";
import type { AppLanguage } from "@/lib/i18n";

const LANGUAGES: { code: AppLanguage; label: string }[] = [
  { code: "tr", label: "TR" },
  { code: "en", label: "EN" },
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
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {lang.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 3,
    gap: 2,
  },
  option: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 11,
  },
  optionSelected: {
    backgroundColor: theme.surfaceRaised,
  },
  label: {
    fontSize: 12,
    fontFamily: theme.fonts.bold,
    color: theme.textDim,
  },
  labelSelected: {
    color: theme.text,
  },
});
