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

// POST /api/auth/guest — create or resume guest session
router.post("/guest", async (req, res) => {
  const displayName =
    typeof req.body.displayName === "string" && req.body.displayName.trim()
      ? req.body.displayName.trim().slice(0, 24)
      : defaultPlayerName(req);

  const resumeToken =
    typeof req.body.resumeToken === "string" ? req.body.resumeToken : null;

  if (resumeToken) {
    const payload = verifyAuthToken(resumeToken);
    if (payload) {
      const rows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1);
      if (rows.length > 0) {
        return res.json(issueSession(rows[0]));
      }
    }
  }

  try {
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
