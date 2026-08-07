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
import {
  cacheCoinBalance,
  claimDailyLoginOnce,
  COIN_BALANCE_KEY,
  readCachedCoinBalance,
} from "@/lib/coinsClient";

const AUTH_TOKEN_KEY = "@tugup_auth_token";
const PLAYER_TOKEN_KEY = "player_token";
const DISPLAY_NAME_KEY = "@tugup_display_name";
const FRIEND_CODE_KEY = "@tugup_friend_code";
const USER_ID_KEY = "@tugup_user_id";

export type DailyRewardPopup = {
  reward: number;
  streak: number;
};

interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  playerToken: string | null;
  isLoading: boolean;
  coinBalance: number;
  dailyReward: DailyRewardPopup | null;
  dismissDailyReward: () => void;
  ensureSession: (displayName?: string) => Promise<AuthSession>;
  updateDisplayName: (displayName: string) => Promise<void>;
  refreshCoins: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [coinBalance, setCoinBalance] = useState(0);
  const [dailyReward, setDailyReward] = useState<DailyRewardPopup | null>(null);

  const applySession = useCallback(async (session: AuthSession) => {
    setUser(session.user);
    setToken(session.token);
    setPlayerToken(session.playerToken);
    await AsyncStorage.multiSet([
      [AUTH_TOKEN_KEY, session.token],
      [PLAYER_TOKEN_KEY, session.playerToken],
      [DISPLAY_NAME_KEY, session.user.displayName],
      [FRIEND_CODE_KEY, session.user.friendCode],
      [USER_ID_KEY, session.user.id],
    ]);
  }, []);

  const runDailyClaim = useCallback(async (authToken: string) => {
    try {
      const result = await claimDailyLoginOnce(authToken);
      setCoinBalance(result.balance);
      await cacheCoinBalance(result.balance);
      if (result.claimed) {
        setDailyReward((prev) => prev ?? { reward: result.reward, streak: result.streak });
      }
    } catch {
      // Keep cached balance; home still usable during API cold start
    }
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
      const trimmed = displayName.trim().slice(0, 24);
      if (!trimmed) throw new Error("empty name");

      let authToken = token;
      if (!authToken) {
        const session = await ensureSession(trimmed);
        authToken = session.token;
      }

      const updated = await apiFetch<PublicUser & { playerToken: string }>(
        "/api/auth/me",
        {
          method: "PATCH",
          token: authToken,
          body: JSON.stringify({ displayName: trimmed }),
        },
      );
      setUser({
        id: updated.id,
        displayName: updated.displayName,
        friendCode: updated.friendCode,
        authProvider: updated.authProvider,
      });
      await AsyncStorage.multiSet([
        [DISPLAY_NAME_KEY, updated.displayName],
        [FRIEND_CODE_KEY, updated.friendCode],
        [USER_ID_KEY, updated.id],
      ]);
    },
    [token, ensureSession],
  );

  const refreshCoins = useCallback(async () => {
    const authToken = token ?? (await ensureSession()).token;
    await runDailyClaim(authToken);
  }, [token, ensureSession, runDailyClaim]);

  const dismissDailyReward = useCallback(() => {
    setDailyReward(null);
  }, []);

  // 1) Hydrate UI instantly from disk  2) Then warm session + claim in background
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const pairs = await AsyncStorage.multiGet([
          AUTH_TOKEN_KEY,
          PLAYER_TOKEN_KEY,
          DISPLAY_NAME_KEY,
          FRIEND_CODE_KEY,
          USER_ID_KEY,
          COIN_BALANCE_KEY,
        ]);
        if (cancelled) return;
        const map = Object.fromEntries(pairs);

        if (map[AUTH_TOKEN_KEY]) setToken(map[AUTH_TOKEN_KEY]);
        if (map[PLAYER_TOKEN_KEY]) setPlayerToken(map[PLAYER_TOKEN_KEY]);
        if (map[DISPLAY_NAME_KEY]) {
          setUser({
            id: map[USER_ID_KEY] ?? "local",
            displayName: map[DISPLAY_NAME_KEY]!,
            friendCode: map[FRIEND_CODE_KEY] ?? "—",
            authProvider: "guest",
          });
        }
        const cachedBalance = map[COIN_BALANCE_KEY];
        if (cachedBalance != null) {
          const n = Number(cachedBalance);
          if (Number.isFinite(n)) setCoinBalance(n);
        } else {
          const bal = await readCachedCoinBalance();
          if (!cancelled && bal != null) setCoinBalance(bal);
        }
      } catch {
        // ignore hydrate errors
      }

      try {
        const session = await ensureSession();
        if (cancelled) return;
        // Fire claim immediately after session — don't wait for Home focus
        await runDailyClaim(session.token);
      } catch {
        // offline / cold start failure
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      playerToken,
      isLoading,
      coinBalance,
      dailyReward,
      dismissDailyReward,
      ensureSession,
      updateDisplayName,
      refreshCoins,
    }),
    [
      user,
      token,
      playerToken,
      isLoading,
      coinBalance,
      dailyReward,
      dismissDailyReward,
      ensureSession,
      updateDisplayName,
      refreshCoins,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
