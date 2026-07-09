import { Platform } from "react-native";

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
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string; message?: string }).error ?? (data as { message?: string }).message ?? "İstek başarısız.");
  }
  return data as T;
}
