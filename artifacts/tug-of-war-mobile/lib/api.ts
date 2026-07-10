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

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${getApiUrl()}${path}`, {
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
