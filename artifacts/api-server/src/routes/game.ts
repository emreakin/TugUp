import { Router } from "express";
import { db, gameRoomsTable, gameInvitesTable, usersTable } from "@workspace/db";
import { eq, and, isNull, sql, desc, gt } from "drizzle-orm";
import { logger } from "../lib/logger";
import crypto from "crypto";
import { generateId, requireAuth, type AuthedRequest } from "../lib/auth";
import { defaultPlayerName, fixedMatchup, reqT } from "../lib/i18n";

const router = Router();

const GAME_INVITE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const APP_SCHEME = "tug-of-war-mobile";

function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

function buildGameInviteUrl(inviteId: string) {
  return `${APP_SCHEME}://invite/game/${inviteId}`;
}

// ── POST /api/game/join ─────────────────────────────────────────────
router.post("/join", async (req, res) => {
  const playerName =
    typeof req.body.name === "string" && req.body.name.trim()
      ? req.body.name.trim()
      : defaultPlayerName(req);
  const playerToken = req.body.playerToken || generateToken();

  try {
    // Check if player is already in a room (not ended) — most recent first
    const existing = await db
      .select()
      .from(gameRoomsTable)
      .where(
        sql`${gameRoomsTable.leftPlayerToken} = ${playerToken} OR ${gameRoomsTable.rightPlayerToken} = ${playerToken}`,
      )
      .orderBy(desc(gameRoomsTable.createdAt))
      .limit(1);

    if (existing.length > 0 && existing[0].status !== "ended") {
      const room = existing[0];
      const side =
        room.leftPlayerToken === playerToken ? "left" : "right";
      const opponentName =
        side === "left" ? room.rightPlayerName : room.leftPlayerName;
      return res.json({
        roomId: room.id,
        side,
        matchup: fixedMatchup(req),
        opponentName,
        status: room.status,
        playerToken,
      });
    }

    // Look for active public waiting rooms (exclude private friend rooms)
    const waiting = await db
      .select()
      .from(gameRoomsTable)
      .where(
        and(
          eq(gameRoomsTable.status, "waiting"),
          eq(gameRoomsTable.active, true),
          eq(gameRoomsTable.isPrivate, false),
          isNull(gameRoomsTable.rightPlayerToken),
        ),
      );

    if (waiting.length > 0) {
      // Join existing room as right player
      const room = waiting[0];
      await db
        .update(gameRoomsTable)
        .set({
          rightPlayerName: playerName,
          rightPlayerToken: playerToken,
          status: "countdown",
          countdownStartedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(gameRoomsTable.id, room.id));

      logger.info(
        { roomId: room.id, leftName: room.leftPlayerName, rightName: playerName },
        "Matched players (DB)",
      );

      return res.json({
        roomId: room.id,
        side: "right",
        matchup: fixedMatchup(req),
        opponentName: room.leftPlayerName,
        status: "countdown",
        playerToken,
      });
    }

    // Create new room
    const roomId = `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await db.insert(gameRoomsTable).values({
      id: roomId,
      matchupId: "fixed",
      leftPlayerName: playerName,
      leftPlayerToken: playerToken,
      status: "waiting",
      offset: 0,
      leftPulls: 0,
      rightPulls: 0,
      updatedAt: new Date(),
    });

    logger.info(
      { roomId, playerName },
      "New waiting room created (DB)",
    );

    return res.json({
      roomId,
      side: "left",
      matchup: fixedMatchup(req),
      opponentName: null,
      status: "waiting",
      playerToken,
    });
  } catch (err) {
    logger.error({ err }, "Game join error");
    return res.status(500).json({ message: reqT(req, "serverError") });
  }
});

// ── GET /api/game/state/:roomId ──────────────────────────────────────────────
router.get("/state/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const playerToken = req.query.playerToken as string;

  try {
    const rooms = await db
      .select()
      .from(gameRoomsTable)
      .where(eq(gameRoomsTable.id, roomId))
      .limit(1);
    if (rooms.length === 0) {
      return res.status(404).json({ message: reqT(req, "roomNotFound") });
    }

    const room = rooms[0];

    // Auto-transition countdown → playing after 5s
    let status = room.status;
    if (status === "countdown" && room.countdownStartedAt) {
      const elapsed = Date.now() - new Date(room.countdownStartedAt).getTime();
      if (elapsed >= 5000) {
        await db
          .update(gameRoomsTable)
          .set({ status: "playing", updatedAt: new Date() })
          .where(eq(gameRoomsTable.id, roomId));
        status = "playing";
      }
    }

    const side =
      room.leftPlayerToken === playerToken
        ? "left"
        : room.rightPlayerToken === playerToken
          ? "right"
          : null;
    const opponentName =
      side === "left" ? room.rightPlayerName : room.leftPlayerName;

    // Countdown remaining seconds
    let countdown = 0;
    if (status === "countdown" && room.countdownStartedAt) {
      const elapsed =
        Date.now() - new Date(room.countdownStartedAt).getTime();
      countdown = Math.max(0, Math.ceil((5000 - elapsed) / 1000));
    }

    return res.json({
      status,
      offset: room.offset,
      leftPulls: room.leftPulls,
      rightPulls: room.rightPulls,
      winner: room.winner,
      countdown,
      opponentName,
      matchup: fixedMatchup(req),
      side,
    });
  } catch (err) {
    logger.error({ err }, "Game state error");
    return res.status(500).json({ message: reqT(req, "serverError") });
  }
});

// ── POST /api/game/pull/:roomId ─────────────────────────────────────────────
router.post("/pull/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const { playerToken, side } = req.body;

  if (!playerToken || !side || (side !== "left" && side !== "right")) {
    return res.status(400).json({ message: reqT(req, "invalidRequest") });
  }

  try {
    const rooms = await db
      .select()
      .from(gameRoomsTable)
      .where(eq(gameRoomsTable.id, roomId))
      .limit(1);
    if (rooms.length === 0) {
      return res.status(404).json({ message: reqT(req, "roomNotFound") });
    }

    const room = rooms[0];

    // Verify player belongs to this room
    const isLeft = room.leftPlayerToken === playerToken;
    const isRight = room.rightPlayerToken === playerToken;
    if ((side === "left" && !isLeft) || (side === "right" && !isRight)) {
      return res.status(403).json({ message: reqT(req, "unauthorized") });
    }

    // Auto-transition countdown → playing
    let status = room.status;
    if (status === "countdown" && room.countdownStartedAt) {
      const elapsed =
        Date.now() - new Date(room.countdownStartedAt).getTime();
      if (elapsed >= 5000) {
        status = "playing";
      } else {
        return res.status(400).json({ message: reqT(req, "gameNotStarted") });
      }
    }

    if (status !== "playing") {
      return res.status(400).json({ message: reqT(req, "gameNotActive") });
    }

    if (room.winner) {
      return res.status(400).json({ message: reqT(req, "gameEnded") });
    }

    const winThreshold = fixedMatchup(req).winThreshold;

    const delta = side === "left" ? -1 : 1;
    const newOffset = Math.max(
      -winThreshold,
      Math.min(winThreshold, room.offset + delta),
    );
    const newLeftPulls =
      side === "left" ? room.leftPulls + 1 : room.leftPulls;
    const newRightPulls =
      side === "right" ? room.rightPulls + 1 : room.rightPulls;

    let winner: string | null = null;
    if (newOffset <= -winThreshold) winner = "left";
    else if (newOffset >= winThreshold) winner = "right";

    const updates: Record<string, unknown> = {
      offset: newOffset,
      leftPulls: newLeftPulls,
      rightPulls: newRightPulls,
      updatedAt: new Date(),
    };
    if (winner) {
      updates.status = "ended";
      updates.winner = winner;
      updates.active = false;
    }

    await db
      .update(gameRoomsTable)
      .set(updates)
      .where(eq(gameRoomsTable.id, roomId));

    return res.json({
      offset: newOffset,
      leftPulls: newLeftPulls,
      rightPulls: newRightPulls,
      winner,
      status: winner ? "ended" : "playing",
    });
  } catch (err) {
    logger.error({ err }, "Game pull error");
    return res.status(500).json({ message: reqT(req, "serverError") });
  }
});

// ── POST /api/game/leave/:roomId ─────────────────────────────────────────────
router.post("/leave/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const { playerToken } = req.body;

  if (!playerToken) {
    return res.status(400).json({ message: reqT(req, "invalidRequest") });
  }

  try {
    const rooms = await db
      .select()
      .from(gameRoomsTable)
      .where(eq(gameRoomsTable.id, roomId))
      .limit(1);

    if (rooms.length === 0) {
      return res.status(404).json({ message: reqT(req, "roomNotFound") });
    }

    const room = rooms[0];

    // Verify player belongs to this room
    const isLeft = room.leftPlayerToken === playerToken;
    const isRight = room.rightPlayerToken === playerToken;
    if (!isLeft && !isRight) {
      return res.status(403).json({ message: reqT(req, "unauthorized") });
    }

    // If no opponent yet, just delete the room
    if (!room.rightPlayerToken || room.status === "waiting") {
      await db.delete(gameRoomsTable).where(eq(gameRoomsTable.id, roomId));
      logger.info({ roomId }, "Player left waiting room — room deleted");
      return res.json({ deleted: true });
    }

    // Opponent exists — mark as ended, the leaving player loses
    const winner = isLeft ? "right" : "left";
    await db
      .update(gameRoomsTable)
      .set({ status: "ended", winner, active: false, updatedAt: new Date() })
      .where(eq(gameRoomsTable.id, roomId));

    logger.info({ roomId, winner }, "Player left — opponent wins");

    return res.json({ deleted: false, winner });
  } catch (err) {
    logger.error({ err }, "Game leave error");
    return res.status(500).json({ message: reqT(req, "serverError") });
  }
});

// ── POST /api/game/create-invite — private 1v1 room for friends ─────────────
router.post("/create-invite", requireAuth, async (req: AuthedRequest, res) => {
  const playerName =
    typeof req.body.name === "string" && req.body.name.trim()
      ? req.body.name.trim().slice(0, 24)
      : defaultPlayerName(req);

  try {
    const userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (userRows.length === 0) {
      return res.status(404).json({ message: reqT(req, "userNotFound") });
    }
    const user = userRows[0];
    const displayName = playerName || user.displayName;

    const roomId = `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const inviteId = generateId();
    const expiresAt = new Date(Date.now() + GAME_INVITE_TTL_MS);

    await db.insert(gameRoomsTable).values({
      id: roomId,
      matchupId: "fixed",
      leftPlayerName: displayName,
      leftPlayerToken: user.playerToken,
      status: "waiting",
      isPrivate: true,
      hostUserId: user.id,
      offset: 0,
      leftPulls: 0,
      rightPulls: 0,
      updatedAt: new Date(),
    });

    await db.insert(gameInvitesTable).values({
      id: inviteId,
      hostUserId: user.id,
      roomId,
      expiresAt,
    });

    const url = buildGameInviteUrl(inviteId);
    logger.info({ roomId, inviteId, hostUserId: user.id }, "Private game invite created");

    return res.json({
      roomId,
      inviteId,
      url,
      shareMessage: reqT(req, "gameShareMessage", { name: displayName, url }),
      expiresAt: expiresAt.toISOString(),
      side: "left",
      matchup: fixedMatchup(req),
      opponentName: null,
      status: "waiting",
      playerToken: user.playerToken,
    });
  } catch (err) {
    logger.error({ err }, "Create game invite error");
    return res.status(500).json({ message: reqT(req, "serverError") });
  }
});

// ── POST /api/game/join-invite/:inviteId — join private room via link ───────
router.post("/join-invite/:inviteId", requireAuth, async (req: AuthedRequest, res) => {
  const { inviteId } = req.params;
  const playerName =
    typeof req.body.name === "string" && req.body.name.trim()
      ? req.body.name.trim().slice(0, 24)
      : defaultPlayerName(req);

  try {
    const inviteRows = await db
      .select()
      .from(gameInvitesTable)
      .where(
        and(
          eq(gameInvitesTable.id, inviteId),
          isNull(gameInvitesTable.usedBy),
          gt(gameInvitesTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (inviteRows.length === 0) {
      return res.status(404).json({ message: reqT(req, "invalidInvite") });
    }

    const invite = inviteRows[0];
    if (invite.hostUserId === req.userId) {
      return res.status(400).json({ message: reqT(req, "cannotJoinOwnInvite") });
    }

    const userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (userRows.length === 0) {
      return res.status(404).json({ message: reqT(req, "userNotFound") });
    }
    const user = userRows[0];
    const displayName = playerName || user.displayName;

    const roomRows = await db
      .select()
      .from(gameRoomsTable)
      .where(eq(gameRoomsTable.id, invite.roomId))
      .limit(1);

    if (roomRows.length === 0 || roomRows[0].status !== "waiting" || roomRows[0].rightPlayerToken) {
      return res.status(409).json({ message: reqT(req, "roomFullOrGone") });
    }

    const room = roomRows[0];

    await db
      .update(gameRoomsTable)
      .set({
        rightPlayerName: displayName,
        rightPlayerToken: user.playerToken,
        status: "countdown",
        countdownStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(gameRoomsTable.id, room.id));

    await db
      .update(gameInvitesTable)
      .set({ usedBy: user.id, usedAt: new Date() })
      .where(eq(gameInvitesTable.id, inviteId));

    logger.info(
      { roomId: room.id, inviteId, hostUserId: invite.hostUserId, guestUserId: user.id },
      "Private game invite accepted",
    );

    return res.json({
      roomId: room.id,
      side: "right",
      matchup: fixedMatchup(req),
      opponentName: room.leftPlayerName,
      status: "countdown",
      playerToken: user.playerToken,
    });
  } catch (err) {
    logger.error({ err }, "Join game invite error");
    return res.status(500).json({ message: reqT(req, "serverError") });
  }
});

export default router;
