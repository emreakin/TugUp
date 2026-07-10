import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";
import tr from "@/locales/tr.json";

export const LANGUAGE_STORAGE_KEY = "@tugup/language";

export type LanguagePreference = "system" | "tr" | "en";
export type AppLanguage = "tr" | "en";

export function resolveLanguage(preference: LanguagePreference): AppLanguage {
  if (preference === "tr" || preference === "en") {
    return preference;
  }

  const code = Localization.getLocales()[0]?.languageCode;
  return code === "tr" ? "tr" : "en";
}

export async function getStoredLanguagePreference(): Promise<LanguagePreference> {
  const value = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (value === "system" || value === "tr" || value === "en") {
    return value;
  }
  return "system";
}

export async function setStoredLanguagePreference(
  preference: LanguagePreference,
): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  await i18n.changeLanguage(resolveLanguage(preference));
}

void i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: resolveLanguage("system"),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  compatibilityJSON: "v4",
});

export async function hydrateLanguagePreference(): Promise<LanguagePreference> {
  const preference = await getStoredLanguagePreference();
  await i18n.changeLanguage(resolveLanguage(preference));
  return preference;
}

export function getAcceptLanguage(): string {
  const lng = i18n.language;
  return lng === "tr" || lng.startsWith("tr-") ? "tr" : "en";
}

export default i18n;
