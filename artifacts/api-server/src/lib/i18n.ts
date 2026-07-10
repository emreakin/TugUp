import type { Request } from "express";

export type AppLocale = "tr" | "en";

const MESSAGES = {
  tr: {
    serverError: "Sunucu hatası.",
    roomNotFound: "Oda bulunamadı.",
    invalidRequest: "Geçersiz istek.",
    unauthorized: "Yetkisiz.",
    authRequired: "Oturum gerekli.",
    invalidToken: "Geçersiz veya süresi dolmuş oturum.",
    gameNotStarted: "Oyun henüz başlamadı.",
    gameNotActive: "Oyun aktif değil.",
    gameEnded: "Oyun bitti.",
    userNotFound: "Kullanıcı bulunamadı.",
    invalidInvite: "Geçersiz veya süresi dolmuş davet.",
    cannotJoinOwnInvite: "Kendi davetine katılamazsın.",
    cannotAcceptOwnFriendInvite: "Kendi davetini kabul edemezsin.",
    roomFullOrGone: "Oda dolu veya artık mevcut değil.",
    inviteNotFound: "Davet bulunamadı.",
    inviteAlreadyUsed: "Bu davet zaten kullanıldı.",
    inviteExpired: "Davetin süresi doldu.",
    invalidName: "Geçersiz isim.",
    invalidMatchupId: "Geçersiz mücadele.",
    invalidSuggestionId: "Geçersiz id",
    notFound: "Bulunamadı",
    dailyAdLimitReached: "Günlük video hakkın doldu.",
    defaultPlayer: "Oyuncu",
    teamA: "Takım A",
    teamB: "Takım B",
    friendShareMessage: "TugUp'ta arkadaş olalım! {{url}}",
    gameShareMessage: "{{name}} seni TugUp 1v1'e davet ediyor! {{url}}",
  },
  en: {
    serverError: "Server error.",
    roomNotFound: "Room not found.",
    invalidRequest: "Invalid request.",
    unauthorized: "Unauthorized.",
    authRequired: "Authentication required.",
    invalidToken: "Invalid or expired session.",
    gameNotStarted: "The game has not started yet.",
    gameNotActive: "The game is not active.",
    gameEnded: "The game has ended.",
    userNotFound: "User not found.",
    invalidInvite: "Invalid or expired invite.",
    cannotJoinOwnInvite: "You cannot join your own invite.",
    cannotAcceptOwnFriendInvite: "You cannot accept your own invite.",
    roomFullOrGone: "The room is full or no longer available.",
    inviteNotFound: "Invite not found.",
    inviteAlreadyUsed: "This invite has already been used.",
    inviteExpired: "This invite has expired.",
    invalidName: "Invalid name.",
    invalidMatchupId: "Invalid matchup.",
    invalidSuggestionId: "Invalid id",
    notFound: "Not found",
    dailyAdLimitReached: "Daily video reward limit reached.",
    defaultPlayer: "Player",
    teamA: "Team A",
    teamB: "Team B",
    friendShareMessage: "Let's be friends on TugUp! {{url}}",
    gameShareMessage: "{{name}} invited you to a TugUp 1v1 match! {{url}}",
  },
} as const;

export type MessageKey = keyof typeof MESSAGES.tr;

export function getLocale(req: Request): AppLocale {
  const header = req.headers["accept-language"];
  if (typeof header === "string") {
    const primary = header.split(",")[0]?.trim().toLowerCase();
    if (primary?.startsWith("tr")) return "tr";
  }
  return "en";
}

export function t(
  locale: AppLocale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  let message: string = MESSAGES[locale][key] ?? MESSAGES.en[key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      message = message.replaceAll(`{{${name}}}`, String(value));
    }
  }
  return message;
}

export function reqT(
  req: Request,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  return t(getLocale(req), key, params);
}

export function fixedMatchup(req: Request) {
  const locale = getLocale(req);
  return {
    id: "fixed",
    leftTeam: t(locale, "teamA"),
    rightTeam: t(locale, "teamB"),
    leftColor: "#ef4444",
    rightColor: "#3b82f6",
    emoji: "⚔️",
    winThreshold: 10,
  };
}

export function defaultPlayerName(req: Request): string {
  return reqT(req, "defaultPlayer");
}
