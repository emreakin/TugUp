import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";
import tr from "@/locales/tr.json";

export const LANGUAGE_STORAGE_KEY = "@tugup/language";

export type LanguagePreference = "system" | "tr" | "en";
export type AppLanguage = "tr" | "en";

function getDeviceLanguageCode(): string | undefined {
  try {
    return Localization.getLocales()[0]?.languageCode ?? undefined;
  } catch {
    return undefined;
  }
}

export function resolveLanguage(preference: LanguagePreference): AppLanguage {
  if (preference === "tr" || preference === "en") {
    return preference;
  }

  const code = getDeviceLanguageCode();
  return code === "tr" ? "tr" : "en";
}

export async function getStoredLanguagePreference(): Promise<LanguagePreference> {
  try {
    const value = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (value === "system" || value === "tr" || value === "en") {
      return value;
    }
  } catch {
    // Ignore storage errors on startup
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
  try {
    const preference = await getStoredLanguagePreference();
    await i18n.changeLanguage(resolveLanguage(preference));
    return preference;
  } catch {
    await i18n.changeLanguage("en");
    return "system";
  }
}

export function getAcceptLanguage(): string {
  const lng = i18n.language ?? "en";
  return lng === "tr" || lng.startsWith("tr-") ? "tr" : "en";
}

export default i18n;
