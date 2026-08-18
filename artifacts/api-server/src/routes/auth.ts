import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  generateFriendCode,
  generateId,
  generatePlayerToken,
  requireAuth,
  signAuthToken,
  userToPublic,
  verifyAuthToken,
  type AuthedRequest,
} from "../lib/auth";
import { logger } from "../lib/logger";
import { defaultPlayerName, reqT } from "../lib/i18n";

const router = Router();

async function createUniqueFriendCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateFriendCode();
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.friendCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  return `TUG-${generateId().slice(0, 4).toUpperCase()}`;
}

async function createGuestUser(displayName: string) {
  const id = generateId();
  const friendCode = await createUniqueFriendCode();
  const playerToken = generatePlayerToken();
  const [user] = await db
    .insert(usersTable)
    .values({
      id,
      displayName,
      authProvider: "guest",
      playerToken,
      friendCode,
    })
    .returning();
  return user;
}

function issueSession(user: typeof usersTable.$inferSelect) {
  return {
    token: signAuthToken(user.id),
    user: userToPublic(user),
    playerToken: user.playerToken,
  };
}

async function findUserById(userId: string) {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

async function findUserByPlayerToken(playerToken: string) {
  const token = playerToken.trim();
  if (!token || token.length < 16 || token.length > 128) return null;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.playerToken, token))
    .limit(1);
  return rows[0] ?? null;
}

// POST /api/auth/guest — resume existing guest, or create only if unknown
router.post("/guest", async (req, res) => {
  const displayName =
    typeof req.body.displayName === "string" && req.body.displayName.trim()
      ? req.body.displayName.trim().slice(0, 24)
      : defaultPlayerName(req);

  const resumeToken =
    typeof req.body.resumeToken === "string" ? req.body.resumeToken : null;
  const playerToken =
    typeof req.body.playerToken === "string" ? req.body.playerToken : null;

  try {
    if (resumeToken) {
      const payload =
        verifyAuthToken(resumeToken) ??
        verifyAuthToken(resumeToken, { ignoreExpiry: true });
      if (payload) {
        const existing = await findUserById(payload.userId);
        if (existing) return res.json(issueSession(existing));
      }
    }

    if (playerToken) {
      const existing = await findUserByPlayerToken(playerToken);
      if (existing) return res.json(issueSession(existing));
    }

    const user = await createGuestUser(displayName);
    logger.info({ userId: user.id, friendCode: user.friendCode }, "Guest user created");
    return res.json(issueSession(user));
  } catch (err) {
    logger.error({ err }, "Guest auth error");
    return res.status(500).json({ error: reqT(req, "serverError") });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);
  if (rows.length === 0) {
    return res.status(404).json({ error: reqT(req, "userNotFound") });
  }
  const user = rows[0];
  return res.json({
    ...userToPublic(user),
    playerToken: user.playerToken,
  });
});

// PATCH /api/auth/me — update display name
router.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  const displayName =
    typeof req.body.displayName === "string" && req.body.displayName.trim()
      ? req.body.displayName.trim().slice(0, 24)
      : null;
  if (!displayName) {
    return res.status(400).json({ error: reqT(req, "invalidName") });
  }

  const [updated] = await db
    .update(usersTable)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  if (!updated) {
    return res.status(404).json({ error: reqT(req, "userNotFound") });
  }

  return res.json({
    ...userToPublic(updated),
    playerToken: updated.playerToken,
  });
});

export default router;
