import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, matchupsTable } from "@workspace/db";
import { reqT } from "../lib/i18n";

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
    winThreshold: 100,
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
    winThreshold: 100,
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
    winThreshold: 100,
  },
];

async function seedDefaultMatchups() {
  for (const m of DEFAULT_MATCHUPS) {
    await db
      .insert(matchupsTable)
      .values(m)
      .onConflictDoNothing();
  }
}

// Seed on module load
seedDefaultMatchups().catch(() => {});

// GET /api/matchups
router.get("/", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(matchupsTable)
      .orderBy(asc(matchupsTable.sortOrder));

    res.json(rows);
  } catch (err) {
    console.error("matchups error", err);
    res.status(500).json({ error: reqT(req, "serverError") });
  }
});

export default router;
