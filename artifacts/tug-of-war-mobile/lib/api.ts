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

/**
 * Render'ın router'ı, uyuyan instance uyanırken isteği bekletmek yerine hızlıca
 * 502/503/504 döndürebiliyor. Bu "hata" değil, "birazdan hazır" anlamına gelir.
 */
export function isColdStartStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

/**
 * Spin-up'ı bekleyen fetch: 503'e anında pes etmek yerine uyanma penceresi
 * boyunca artan aralıklarla yeniden dener. Yalnızca idempotent isteklerde
 * tekrar dener — POST'u yeniden göndermek yan etki yaratabilir.
 */
export async function fetchThroughColdStart(
  url: string,
  options: RequestInit & { deadlineMs?: number; onWaking?: () => void } = {},
): Promise<Response> {
  const { deadlineMs = COLD_START_TIMEOUT_MS, onWaking, ...rest } = options;
  const method = (rest.method ?? "GET").toUpperCase();
  const retryable = method === "GET" || method === "HEAD";
  const startedAt = Date.now();
  const remaining = () => deadlineMs - (Date.now() - startedAt);

  let waitMs = 2000;
  let lastError: unknown;

  while (remaining() > 0) {
    try {
      const res = await fetchWithTimeout(url, {
        ...rest,
        timeoutMs: remaining(),
      });
      if (!retryable || !isColdStartStatus(res.status)) return res;
      lastError = new Error(`HTTP ${res.status}`);
      onWaking?.();
    } catch (err) {
      lastError = err;
      if (!retryable) throw err;
    }
    const left = remaining();
    if (left <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, left)));
    waitMs = Math.min(Math.round(waitMs * 1.6), 8000);
  }

  throw lastError ?? new Error("Request failed");
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

export type BattleSide = "left" | "right";

/** Current UTC-week Online battle state from GET /api/matchups/:id/state */
export interface MatchupBattleState {
  matchupId: string;
  weekStartDate: string;
  weekEndDate: string;
  /** ISO instant — authoritative UTC week end */
  weekEndsAt: string;
  leftPoints: number;
  rightPoints: number;
  totalPoints: number;
  leftPercentage: number;
  rightPercentage: number;
  leaderSide: BattleSide | null;
  isDraw: boolean;
}

export interface PublicMatchup {
  id: string;
  leftTeam: string;
  rightTeam: string;
  leftColor: string;
  rightColor: string;
  emoji: string;
  leftWins: number;
  rightWins: number;
  isActive: boolean;
  sortOrder?: number;
  source?: string;
}

/**
 * Cold-start resilient fetch of weekly battle state.
 * Zero scores are only returned when the server says so — callers must not
 * invent zeros on network failure.
 */
export async function fetchMatchupBattleState(
  matchupId: string,
  options?: { onWaking?: () => void },
): Promise<MatchupBattleState> {
  const res = await fetchThroughColdStart(
    `${getApiBase()}/matchups/${encodeURIComponent(matchupId)}/state`,
    {
      headers: getApiHeaders({}, { json: false }),
      onWaking: options?.onWaking,
    },
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as MatchupBattleState;
}

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
