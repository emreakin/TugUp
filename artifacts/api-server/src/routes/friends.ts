import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, friendInvitesTable, usersTable } from "@workspace/db";
import { generateId, requireAuth, type AuthedRequest } from "../lib/auth";
import {
  creditCoins,
  REFERRAL_REWARD_NEW_USER,
  REFERRAL_REWARD_RETURNING_USER,
} from "../lib/coins";
import { addFriendship, listFriends, removeFriendship } from "../lib/friends";
import { buildFriendInviteShareUrl } from "../lib/inviteLinks";
import { logger } from "../lib/logger";
import { reqT } from "../lib/i18n";

const router = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * New install / first-time user: account created at or after the invite.
 * Returning user: account already existed before this invite was created.
 */
function isNewReferredUser(
  accepterCreatedAt: Date,
  inviteCreatedAt: Date,
): boolean {
  return accepterCreatedAt.getTime() >= inviteCreatedAt.getTime();
}

// GET /api/friends — list accepted friends
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const friends = await listFriends(req.userId!);
    return res.json(friends);
  } catch (err) {
    logger.error({ err }, "List friends error");
    return res.status(500).json({ error: reqT(req, "serverError") });
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

    const url = buildFriendInviteShareUrl(inviteId);
    return res.json({
      inviteId,
      url,
      shareMessage: reqT(req, "friendShareMessage", { url }),
      expiresAt: expiresAt.toISOString(),
      referralRewardNew: REFERRAL_REWARD_NEW_USER,
      referralRewardReturning: REFERRAL_REWARD_RETURNING_USER,
    });
  } catch (err) {
    logger.error({ err }, "Create friend invite error");
    return res.status(500).json({ error: reqT(req, "serverError") });
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
    return res.status(404).json({ error: reqT(req, "inviteNotFound") });
  }

  const invite = rows[0];
  if (invite.usedBy) {
    return res.status(410).json({ error: reqT(req, "inviteAlreadyUsed") });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return res.status(410).json({ error: reqT(req, "inviteExpired") });
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
      .where(eq(friendInvitesTable.id, inviteId))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: reqT(req, "inviteNotFound") });
    }

    const invite = rows[0];

    // Idempotent: same user already accepted this invite
    if (invite.usedBy === userId) {
      const inviter = await db
        .select({
          id: usersTable.id,
          displayName: usersTable.displayName,
          friendCode: usersTable.friendCode,
        })
        .from(usersTable)
        .where(eq(usersTable.id, invite.inviterId))
        .limit(1);
      return res.json({
        accepted: true,
        friend: inviter[0] ?? null,
        alreadyAccepted: true,
      });
    }

    if (invite.usedBy) {
      return res.status(410).json({ error: reqT(req, "inviteAlreadyUsed") });
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      return res.status(410).json({ error: reqT(req, "inviteExpired") });
    }

    if (invite.inviterId === userId) {
      return res.status(400).json({ error: reqT(req, "cannotAcceptOwnFriendInvite") });
    }

    const accepterRows = await db
      .select({
        id: usersTable.id,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const accepter = accepterRows[0];
    if (!accepter) {
      return res.status(404).json({ error: reqT(req, "userNotFound") });
    }

    await addFriendship(invite.inviterId, userId);

    await db
      .update(friendInvitesTable)
      .set({ usedBy: userId, usedAt: new Date() })
      .where(eq(friendInvitesTable.id, inviteId));

    const isNewUser = isNewReferredUser(accepter.createdAt, invite.createdAt);
    const reward = isNewUser
      ? REFERRAL_REWARD_NEW_USER
      : REFERRAL_REWARD_RETURNING_USER;

    let rewardBalance: number | null = null;
    try {
      const credited = await creditCoins(
        invite.inviterId,
        reward,
        "friend_referral",
      );
      rewardBalance = credited.balance;
      logger.info(
        {
          inviteId,
          inviterId: invite.inviterId,
          userId,
          isNewUser,
          reward,
          rewardBalance,
        },
        "Friend invite accepted — inviter rewarded",
      );
    } catch (rewardErr) {
      logger.error({ err: rewardErr, inviteId }, "Friend referral reward failed");
    }

    const inviter = await db
      .select({
        id: usersTable.id,
        displayName: usersTable.displayName,
        friendCode: usersTable.friendCode,
      })
      .from(usersTable)
      .where(eq(usersTable.id, invite.inviterId))
      .limit(1);

    return res.json({
      accepted: true,
      friend: inviter[0] ?? null,
      referralReward: {
        amount: reward,
        isNewUser,
        inviterBalance: rewardBalance,
      },
    });
  } catch (err) {
    logger.error({ err }, "Accept friend invite error");
    return res.status(500).json({ error: reqT(req, "serverError") });
  }
});

// DELETE /api/friends/:friendId — remove friend
router.delete("/:friendId", requireAuth, async (req: AuthedRequest, res) => {
  const friendId = String(req.params.friendId);
  if (friendId === req.userId) {
    return res.status(400).json({ error: reqT(req, "invalidRequest") });
  }

  try {
    await removeFriendship(req.userId!, friendId);
    return res.json({ removed: true });
  } catch (err) {
    logger.error({ err }, "Remove friend error");
    return res.status(500).json({ error: reqT(req, "serverError") });
  }
});

export default router;
