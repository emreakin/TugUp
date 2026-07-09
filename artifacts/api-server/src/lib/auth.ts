import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  return process.env.JWT_SECRET ?? "tugup-dev-secret-change-in-production";
}

export function signAuthToken(userId: string): string {
  const issuedAt = Date.now();
  const payload = `${userId}.${issuedAt}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyAuthToken(token: string): { userId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return null;
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = createHmac("sha256", getSecret()).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const dot = payload.indexOf(".");
    if (dot === -1) return null;
    const userId = payload.slice(0, dot);
    const issuedAt = Number(payload.slice(dot + 1));
    if (!userId || Number.isNaN(issuedAt)) return null;
    if (Date.now() - issuedAt > TOKEN_TTL_MS) return null;
    return { userId };
  } catch {
    return null;
  }
}

export function generatePlayerToken(): string {
  return randomBytes(16).toString("hex");
}

export function generateId(): string {
  return randomUUID();
}

const FRIEND_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateFriendCode(): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += FRIEND_CODE_CHARS[Math.floor(Math.random() * FRIEND_CODE_CHARS.length)];
  }
  return `TUG-${suffix}`;
}

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = verifyAuthToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.userId = payload.userId;
  next();
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const payload = verifyAuthToken(header.slice(7));
    if (payload) req.userId = payload.userId;
  }
  next();
}

export function userToPublic(user: {
  id: string;
  displayName: string;
  friendCode: string;
  authProvider: string;
}) {
  return {
    id: user.id,
    displayName: user.displayName,
    friendCode: user.friendCode,
    authProvider: user.authProvider,
  };
}
