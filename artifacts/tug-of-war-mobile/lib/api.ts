import { Platform } from "react-native";

export function getApiUrl(): string {
  if (Platform.OS === "web") return "";
  return (
    process.env.EXPO_PUBLIC_API_BASE ??
    `https://${
      process.env.EXPO_PUBLIC_REPLIT_DEV_DOMAIN ??
      "72a67990-7136-40a7-a2ca-48f1c4842176-00-26avhjd9y0o9l.janeway.replit.dev"
    }`
  );
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
