import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  hydrateLanguagePreference,
  setStoredLanguagePreference,
  type LanguagePreference,
} from "@/lib/i18n";

interface LocaleContextValue {
  ready: boolean;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [preference, setPreferenceState] = useState<LanguagePreference>("system");

  useEffect(() => {
    hydrateLanguagePreference()
      .then(setPreferenceState)
      .finally(() => setReady(true));
  }, []);

  const setPreference = useCallback(async (next: LanguagePreference) => {
    await setStoredLanguagePreference(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({ ready, preference, setPreference }),
    [ready, preference, setPreference],
  );

  if (!ready) {
    return null;
  }

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
