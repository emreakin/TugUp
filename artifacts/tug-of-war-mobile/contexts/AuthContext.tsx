import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  apiFetch,
  type AuthSession,
  type PublicUser,
} from "@/lib/api";

const AUTH_TOKEN_KEY = "@tugup_auth_token";
const PLAYER_TOKEN_KEY = "player_token";
const DISPLAY_NAME_KEY = "@tugup_display_name";

interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  playerToken: string | null;
  isLoading: boolean;
  ensureSession: (displayName?: string) => Promise<AuthSession>;
  updateDisplayName: (displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback(async (session: AuthSession) => {
    setUser(session.user);
    setToken(session.token);
    setPlayerToken(session.playerToken);
    await AsyncStorage.multiSet([
      [AUTH_TOKEN_KEY, session.token],
      [PLAYER_TOKEN_KEY, session.playerToken],
      [DISPLAY_NAME_KEY, session.user.displayName],
    ]);
  }, []);

  const ensureSession = useCallback(
    async (displayName?: string) => {
      const savedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      const savedName =
        displayName ??
        (await AsyncStorage.getItem(DISPLAY_NAME_KEY)) ??
        "Oyuncu";

      const session = await apiFetch<AuthSession>("/api/auth/guest", {
        method: "POST",
        body: JSON.stringify({
          displayName: savedName,
          resumeToken: savedToken,
        }),
      });

      await applySession(session);
      return session;
    },
    [applySession],
  );

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      if (!token) return;
      const updated = await apiFetch<PublicUser & { playerToken: string }>(
        "/api/auth/me",
        {
          method: "PATCH",
          token,
          body: JSON.stringify({ displayName }),
        },
      );
      setUser({
        id: updated.id,
        displayName: updated.displayName,
        friendCode: updated.friendCode,
        authProvider: updated.authProvider,
      });
      await AsyncStorage.setItem(DISPLAY_NAME_KEY, updated.displayName);
    },
    [token],
  );

  useEffect(() => {
    ensureSession()
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [ensureSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      playerToken,
      isLoading,
      ensureSession,
      updateDisplayName,
    }),
    [user, token, playerToken, isLoading, ensureSession, updateDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
