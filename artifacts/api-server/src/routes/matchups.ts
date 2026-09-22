import { Router, type IRouter } from "express";
import { asc } from "drizzle-orm";
import { db, matchupsTable } from "@workspace/db";
import { reqT } from "../lib/i18n";
import {
  getMatchupBattleState,
  maybeRunWeeklyProcessing,
} from "../lib/weeklyScores";

const router: IRouter = Router();

const DEFAULT_MATCHUPS = [
  {
    id: "galatasaray-fenerbahce",
    leftTeam: "Galatasaray",
    rightTeam: "Fenerbahçe",
    leftColor: "#ef4444",
    rightColor: "#fbbf24",
    emoji: "⚽",
    sortOrder: 1,
    source: "default",
  },
  {
    id: "tesla-edison",
    leftTeam: "Tesla",
    rightTeam: "Edison",
    leftColor: "#22d3ee",
    rightColor: "#f97316",
    emoji: "⚡",
    sortOrder: 2,
    source: "default",
  },
  {
    id: "android-ios",
    leftTeam: "Android",
    rightTeam: "iOS",
    leftColor: "#4ade80",
    rightColor: "#a78bfa",
    emoji: "📱",
    sortOrder: 3,
    source: "default",
  },
];

/**
 * Boot sırasında bir kez çağrılır (bkz. index.ts). Modül import'unda çalıştırmak,
 * cold start'ta henüz uyanmakta olan veritabanı bağlantısıyla yarışıyordu.
 */
export async function seedDefaultMatchups() {
  for (const m of DEFAULT_MATCHUPS) {
    await db.insert(matchupsTable).values(m).onConflictDoNothing();
  }
}

/** Public matchup list shape — omits deprecated winThreshold. */
function toPublicMatchup(row: typeof matchupsTable.$inferSelect) {
  return {
    id: row.id,
    leftTeam: row.leftTeam,
    rightTeam: row.rightTeam,
    leftColor: row.leftColor,
    rightColor: row.rightColor,
    emoji: row.emoji,
    leftWins: row.leftWins,
    rightWins: row.rightWins,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    source: row.source,
    createdAt: row.createdAt,
  };
}

// GET /api/matchups
router.get("/", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(matchupsTable)
      .orderBy(asc(matchupsTable.sortOrder));

    res.json(rows.map(toPublicMatchup));
  } catch (err) {
    console.error("matchups error", err);
    res.status(500).json({ error: reqT(req, "serverError") });
  }
});

/**
 * GET /api/matchups/:matchupId/state
 * Current UTC-week battle state (accumulated points + derived percentages).
 * Lazily runs weekly processing when the week has rolled over.
 */
router.get("/:matchupId/state", async (req, res) => {
  const matchupId = String(req.params.matchupId ?? "").trim();
  if (!matchupId) {
    res.status(400).json({ error: reqT(req, "invalidMatchupId") });
    return;
  }

  try {
    try {
      await maybeRunWeeklyProcessing();
    } catch {
      /* non-fatal — still serve current week state */
    }

    const state = await getMatchupBattleState(matchupId);
    if (!state) {
      res.status(404).json({ error: reqT(req, "invalidMatchupId") });
      return;
    }
    res.json(state);
  } catch (err) {
    console.error("matchup state error", err);
    res.status(500).json({ error: reqT(req, "serverError") });
  }
});

export default router;
