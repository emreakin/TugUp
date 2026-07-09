import { Router } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, friendInvitesTable, usersTable } from "@workspace/db";
import { generateId, requireAuth, type AuthedRequest } from "../lib/auth";
import { addFriendship, listFriends, removeFriendship } from "../lib/friends";
import { logger } from "../lib/logger";

const router = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const APP_SCHEME = "tug-of-war-mobile";

function buildFriendInviteUrl(inviteId: string) {
  return `${APP_SCHEME}://invite/friend/${inviteId}`;
}

// GET /api/friends — list accepted friends
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const friends = await listFriends(req.userId!);
    return res.json(friends);
  } catch (err) {
    logger.error({ err }, "List friends error");
    return res.status(500).json({ error: "Sunucu hatası." });
  }
});

// POST /api/friends/invite-link — create shareable friend invite link
router.post("/invite-link", requireAuth, async (req: AuthedRequest, res) => {
  const inviteId = generateId();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  try {
    await db.insert(friendInvitesTable).values({
      id: inviteId,
      inviterId: req.userId!,
      expiresAt,
    });

    const url = buildFriendInviteUrl(inviteId);
    return res.json({
      inviteId,
      url,
      shareMessage: `TugUp'ta arkadaş olalım! ${url}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Create friend invite error");
    return res.status(500).json({ error: "Sunucu hatası." });
  }
});

// GET /api/friends/invite/:inviteId — preview invite (public)
router.get("/invite/:inviteId", async (req, res) => {
  const { inviteId } = req.params;
  const rows = await db
    .select()
    .from(friendInvitesTable)
    .where(eq(friendInvitesTable.id, inviteId))
    .limit(1);

  if (rows.length === 0) {
    return res.status(404).json({ error: "Davet bulunamadı." });
  }

  const invite = rows[0];
  if (invite.usedBy) {
    return res.status(410).json({ error: "Bu davet zaten kullanıldı." });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return res.status(410).json({ error: "Davetin süresi doldu." });
  }

  const inviter = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, invite.inviterId))
    .limit(1);

  return res.json({
    inviteId,
    inviter: inviter[0] ?? null,
    expiresAt: invite.expiresAt.toISOString(),
  });
});

// POST /api/friends/accept/:inviteId — accept friend invite via link
router.post("/accept/:inviteId", requireAuth, async (req: AuthedRequest, res) => {
  const { inviteId } = req.params;
  const userId = req.userId!;

  try {
    const rows = await db
      .select()
      .from(friendInvitesTable)
      .where(
        and(
          eq(friendInvitesTable.id, inviteId),
          isNull(friendInvitesTable.usedBy),
          gt(friendInvitesTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Geçersiz veya süresi dolmuş davet." });
    }

    const invite = rows[0];
    if (invite.inviterId === userId) {
      return res.status(400).json({ error: "Kendi davetini kabul edemezsin." });
    }

    await addFriendship(invite.inviterId, userId);

    await db
      .update(friendInvitesTable)
      .set({ usedBy: userId, usedAt: new Date() })
      .where(eq(friendInvitesTable.id, inviteId));

    const inviter = await db
      .select({ id: usersTable.id, displayName: usersTable.displayName, friendCode: usersTable.friendCode })
      .from(usersTable)
      .where(eq(usersTable.id, invite.inviterId))
      .limit(1);

    logger.info({ inviteId, inviterId: invite.inviterId, userId }, "Friend invite accepted");

    return res.json({
      accepted: true,
      friend: inviter[0] ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Accept friend invite error");
    return res.status(500).json({ error: "Sunucu hatası." });
  }
});

// DELETE /api/friends/:friendId — remove friend
router.delete("/:friendId", requireAuth, async (req: AuthedRequest, res) => {
  const friendId = String(req.params.friendId);
  if (friendId === req.userId) {
    return res.status(400).json({ error: "Geçersiz istek." });
  }

  try {
    await removeFriendship(req.userId!, friendId);
    return res.json({ removed: true });
  } catch (err) {
    logger.error({ err }, "Remove friend error");
    return res.status(500).json({ error: "Sunucu hatası." });
  }
});

export default router;
