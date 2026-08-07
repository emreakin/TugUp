import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiFetch, type DailyClaimResult } from "@/lib/api";

export const COIN_BALANCE_KEY = "@tugup_coin_balance";

let inflight: Promise<DailyClaimResult> | null = null;
let doneForUtcDate: string | null = null;
let lastResult: DailyClaimResult | null = null;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Single-flight daily claim — safe to call from boot + home */
export function claimDailyLoginOnce(token: string): Promise<DailyClaimResult> {
  const today = utcToday();
  if (doneForUtcDate === today && lastResult) {
    return Promise.resolve(lastResult);
  }
  if (!inflight) {
    inflight = apiFetch<DailyClaimResult>("/api/coins/daily-claim", {
      method: "POST",
      token,
    })
      .then((result) => {
        lastResult = result;
        doneForUtcDate = today;
        return result;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function cacheCoinBalance(balance: number): Promise<void> {
  await AsyncStorage.setItem(COIN_BALANCE_KEY, String(balance));
}

export async function readCachedCoinBalance(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(COIN_BALANCE_KEY);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
