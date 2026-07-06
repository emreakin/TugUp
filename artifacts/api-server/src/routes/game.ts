import { Router } from "express";
import { db, gameRoomsTable } from "@workspace/db";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import crypto from "crypto";

const router = Router();

const FIXED_MATCHUP = {
  leftTeam: "Takım A",
  rightTeam: "Takım B",
  leftColor: "#ef4444",
  rightColor: "#3b82f6",
  emoji: "⚔️",
  winThreshold: 10,
};

function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

// ── POST /api/game/join ─────────────────────────────────────────────
router.post("/join", async (req, res) => {
  const playerName =
    typeof req.body.name === "string" && req.body.name.trim()
      ? req.body.name.trim()
      : "Oyuncu";
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
        matchup: FIXED_MATCHUP,
        opponentName,
        status: room.status,
        playerToken,
      });
    }

    // Look for active waiting rooms
    const waiting = await db
      .select()
      .from(gameRoomsTable)
      .where(
        and(
          eq(gameRoomsTable.status, "waiting"),
          eq(gameRoomsTable.active, true),
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
        matchup: FIXED_MATCHUP,
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
      matchup: FIXED_MATCHUP,
      opponentName: null,
      status: "waiting",
      playerToken,
    });
  } catch (err) {
    logger.error({ err }, "Game join error");
    return res.status(500).json({ message: "Sunucu hatası." });
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
      return res.status(404).json({ message: "Oda bulunamadı." });
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
      matchup: FIXED_MATCHUP,
      side,
    });
  } catch (err) {
    logger.error({ err }, "Game state error");
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

// ── POST /api/game/pull/:roomId ─────────────────────────────────────────────
router.post("/pull/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const { playerToken, side } = req.body;

  if (!playerToken || !side || (side !== "left" && side !== "right")) {
    return res.status(400).json({ message: "Geçersiz istek." });
  }

  try {
    const rooms = await db
      .select()
      .from(gameRoomsTable)
      .where(eq(gameRoomsTable.id, roomId))
      .limit(1);
    if (rooms.length === 0) {
      return res.status(404).json({ message: "Oda bulunamadı." });
    }

    const room = rooms[0];

    // Verify player belongs to this room
    const isLeft = room.leftPlayerToken === playerToken;
    const isRight = room.rightPlayerToken === playerToken;
    if ((side === "left" && !isLeft) || (side === "right" && !isRight)) {
      return res.status(403).json({ message: "Yetkisiz." });
    }

    // Auto-transition countdown → playing
    let status = room.status;
    if (status === "countdown" && room.countdownStartedAt) {
      const elapsed =
        Date.now() - new Date(room.countdownStartedAt).getTime();
      if (elapsed >= 5000) {
        status = "playing";
      } else {
        return res.status(400).json({ message: "Oyun henüz başlamadı." });
      }
    }

    if (status !== "playing") {
      return res.status(400).json({ message: "Oyun aktif değil." });
    }

    if (room.winner) {
      return res.status(400).json({ message: "Oyun bitti." });
    }

    const winThreshold = FIXED_MATCHUP.winThreshold;

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
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

// ── POST /api/game/leave/:roomId ─────────────────────────────────────────────
router.post("/leave/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const { playerToken } = req.body;

  if (!playerToken) {
    return res.status(400).json({ message: "Geçersiz istek." });
  }

  try {
    const rooms = await db
      .select()
      .from(gameRoomsTable)
      .where(eq(gameRoomsTable.id, roomId))
      .limit(1);

    if (rooms.length === 0) {
      return res.status(404).json({ message: "Oda bulunamadı." });
    }

    const room = rooms[0];

    // Verify player belongs to this room
    const isLeft = room.leftPlayerToken === playerToken;
    const isRight = room.rightPlayerToken === playerToken;
    if (!isLeft && !isRight) {
      return res.status(403).json({ message: "Yetkisiz." });
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
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

export default router;
