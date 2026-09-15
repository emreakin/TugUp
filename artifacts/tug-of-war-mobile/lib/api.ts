import { Platform } from "react-native";

import i18n, { getAcceptLanguage } from "@/lib/i18n";

export const DEFAULT_API_BASE = "https://tugup-api.onrender.com";

/** Host only, no trailing slash — e.g. https://tugup-api.onrender.com */
export function getApiUrl(): string {
  if (Platform.OS === "web") return "";
  return process.env.EXPO_PUBLIC_API_BASE ?? DEFAULT_API_BASE;
}

/** API prefix — e.g. https://tugup-api.onrender.com/api (web: /api) */
export function getApiBase(): string {
  if (Platform.OS === "web") return "/api";
  return `${getApiUrl()}/api`;
}

/**
 * Render free plan 15 dk hareketsizlikten sonra servisi uyutuyor ve uyanması
 * 50 saniyeyi aşabiliyor. İstekler bu yüzden alışıldık timeout'lardan çok daha
 * uzun beklemeye hazır olmak zorunda.
 */
export const COLD_START_TIMEOUT_MS = 75_000;

/** AbortController ile timeout'lanan fetch — asılı kalan istekleri keser. */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = COLD_START_TIMEOUT_MS, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const WARM_UP_THROTTLE_MS = 60_000;
let lastWarmUpAt = 0;

/**
 * Ateşle-ve-unut ping: uyuyan instance, kullanıcı hâlâ ana ekrandayken uyanmaya
 * başlasın. /api/healthz veritabanına dokunmuyor ve sunucu portu şema
 * hazırlığından önce bind ettiği için servis tam hazır olmadan da yanıt veriyor.
 */
export function warmUpApi(): void {
  const now = Date.now();
  if (now - lastWarmUpAt < WARM_UP_THROTTLE_MS) return;
  lastWarmUpAt = now;
  fetchWithTimeout(`${getApiBase()}/healthz`, {
    headers: getApiHeaders({}, { json: false }),
  }).catch(() => {
    // Uyandırma başarısızsa sonraki deneme throttle'a takılmasın
    lastWarmUpAt = 0;
  });
}

export function getApiHeaders(
  extra?: Record<string, string>,
  options?: { json?: boolean },
): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept-Language": getAcceptLanguage(),
    ...extra,
  };
  if (options?.json !== false) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

export interface PublicUser {
  id: string;
  displayName: string;
  friendCode: string;
  authProvider: string;
}

export interface AuthSession {
  token: string;
  user: PublicUser;
  playerToken: string;
}

export interface FriendSummary {
  id: string;
  displayName: string;
  friendCode: string;
}

export interface CoinBalance {
  balance: number;
  dailyStreak: number;
  lastDailyClaimDate: string | null;
  canClaimToday: boolean;
  nextReward: number;
  nextStreak: number;
  jokerCost?: number;
}

/** Must match server JOKER_COIN_COST */
export const JOKER_COIN_COST = 25;

/** Must match server referral rewards */
export const REFERRAL_REWARD_NEW_USER = 250;
export const REFERRAL_REWARD_RETURNING_USER = 100;

export type DailyClaimResult =
  | {
      claimed: true;
      reward: number;
      streak: number;
      balance: number;
    }
  | {
      claimed: false;
      reason: "already_claimed";
      streak: number;
      balance: number;
      nextReward: number;
    };

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null; timeoutMs?: number } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetchWithTimeout(`${getApiUrl()}${path}`, {
    ...rest,
    headers: {
      ...getApiHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string; message?: string }).error ??
        (data as { message?: string }).message ??
        i18n.t("common.requestFailed"),
    );
  }
  return data as T;
}
