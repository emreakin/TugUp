import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { eq } from "drizzle-orm";
import { db, matchupsTable } from "@workspace/db";
import { logger } from "../lib/logger";

interface MatchupInfo {
  id: string;
  leftTeam: string;
  rightTeam: string;
  leftColor: string;
  rightColor: string;
  emoji: string;
  winThreshold: number;
}

interface Player {
  socket: Socket;
  side: "left" | "right";
  name: string;
}

interface Room {
  id: string;
  matchup: MatchupInfo;
  left: Player | null;
  right: Player | null;
  countdownTimer: ReturnType<typeof setInterval> | null;
  gameStarted: boolean;
  offset: number;
  leftPulls: number;
  rightPulls: number;
}

// Active rooms: roomId → Room
const rooms = new Map<string, Room>();
// Waiting rooms: matchupId → roomId (has left player, waiting for right)
const waitingRooms = new Map<string, string>();

function broadcast(room: Room, event: string, data?: unknown) {
  if (room.left) room.left.socket.emit(event, data);
  if (room.right) room.right.socket.emit(event, data);
}

async function getActiveMatchups(): Promise<MatchupInfo[]> {
  try {
    return await db
      .select({
        id: matchupsTable.id,
        leftTeam: matchupsTable.leftTeam,
        rightTeam: matchupsTable.rightTeam,
        leftColor: matchupsTable.leftColor,
        rightColor: matchupsTable.rightColor,
        emoji: matchupsTable.emoji,
        winThreshold: matchupsTable.winThreshold,
      })
      .from(matchupsTable)
      .where(eq(matchupsTable.isActive, true));
  } catch {
    return [];
  }
}

function startCountdown(room: Room) {
  let count = 5;
  broadcast(room, "countdown", { count });
  room.countdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      broadcast(room, "countdown", { count });
    } else {
      clearInterval(room.countdownTimer!);
      room.countdownTimer = null;
      room.gameStarted = true;
      broadcast(room, "start");
    }
  }, 1000);
}

function handlePlayerLeave(roomId: string, side: "left" | "right") {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.countdownTimer) {
    clearInterval(room.countdownTimer);
    room.countdownTimer = null;
  }

  const other = side === "left" ? room.right : room.left;
  if (other) other.socket.emit("opponent_left");

  if (side === "left") room.left = null;
  else room.right = null;

  // Both gone → clean up fully
  if (!room.left && !room.right) {
    rooms.delete(roomId);
    if (waitingRooms.get(room.matchup.id) === roomId) {
      waitingRooms.delete(room.matchup.id);
    }
    return;
  }

  // One player remains → reset room, mark as waiting
  room.gameStarted = false;
  room.offset = 0;
  room.leftPulls = 0;
  room.rightPulls = 0;

  if (!room.left && room.right) {
    room.left = { socket: room.right.socket, side: "left", name: room.right.name };
    room.right = null;
  }

  room.left!.socket.emit("waiting");
  waitingRooms.set(room.matchup.id, roomId);
}

export function attachWsServer(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    path: "/api/socket",
    cors: { origin: "*" },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: Socket) => {
    let myRoomId: string | null = null;
    let mySide: "left" | "right" | null = null;

    socket.on("join", async ({ name }: { name?: string }) => {
      const playerName = typeof name === "string" && name.trim() ? name.trim() : "Oyuncu";
      logger.info({ playerName, socketId: socket.id }, "Player join requested");

      const matchups = await getActiveMatchups();
      logger.info({ matchupCount: matchups.length, waitingCount: waitingRooms.size, roomCount: rooms.size }, "Matchmaking state");

      if (matchups.length === 0) {
        socket.emit("error", { message: "Aktif mücadele bulunamadı." });
        return;
      }

      // Shuffle and try to find an existing waiting room
      const shuffled = [...matchups].sort(() => Math.random() - 0.5);
      let assigned = false;

      for (const matchup of shuffled) {
        const wRoomId = waitingRooms.get(matchup.id);
        if (!wRoomId) continue;
        const room = rooms.get(wRoomId);
        if (!room || !room.left || room.right) continue;

        // Slot found — join as right player
        mySide = "right";
        myRoomId = wRoomId;
        room.right = { socket, side: "right", name: playerName };
        waitingRooms.delete(matchup.id);

        logger.info({ roomId: wRoomId, leftName: room.left.name, rightName: playerName }, "Matched players");

        socket.emit("assigned", {
          matchup,
          side: "right",
          roomId: wRoomId,
          opponentName: room.left.name,
        });
        room.left.socket.emit("opponent_joined", { opponentName: playerName });
        socket.emit("opponent_joined", { opponentName: room.left.name });
        setTimeout(() => startCountdown(room), 300);
        assigned = true;
        break;
      }

      if (!assigned) {
        // No open room — create a new one
        const matchup = shuffled[0];
        const roomId = `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const room: Room = {
          id: roomId,
          matchup,
          left: { socket, side: "left", name: playerName },
          right: null,
          countdownTimer: null,
          gameStarted: false,
          offset: 0,
          leftPulls: 0,
          rightPulls: 0,
        };
        rooms.set(roomId, room);
        waitingRooms.set(matchup.id, roomId);
        myRoomId = roomId;
        mySide = "left";

        logger.info({ roomId, matchupId: matchup.id, playerName }, "New waiting room created");

        socket.emit("assigned", { matchup, side: "left", roomId, opponentName: null });
        socket.emit("waiting");
      }
    });

    socket.on("pull", () => {
      if (!myRoomId || !mySide) return;
      const room = rooms.get(myRoomId);
      if (!room || !room.gameStarted) return;

      const delta = mySide === "left" ? -1 : 1;
      room.offset = Math.max(
        -room.matchup.winThreshold,
        Math.min(room.matchup.winThreshold, room.offset + delta),
      );
      if (mySide === "left") room.leftPulls++;
      else room.rightPulls++;

      broadcast(room, "state", {
        offset: room.offset,
        leftPulls: room.leftPulls,
        rightPulls: room.rightPulls,
      });

      if (room.offset <= -room.matchup.winThreshold) {
        broadcast(room, "end", { winner: "left" });
        room.gameStarted = false;
      } else if (room.offset >= room.matchup.winThreshold) {
        broadcast(room, "end", { winner: "right" });
        room.gameStarted = false;
      }
    });

    socket.on("disconnect", () => {
      if (myRoomId && mySide) handlePlayerLeave(myRoomId, mySide);
    });

    socket.on("error", (err) => {
      logger.warn({ err }, "Socket.IO client error");
    });
  });

  logger.info("Socket.IO matchmaking attached at /api/socket");
}
