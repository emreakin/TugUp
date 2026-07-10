import { Router, type IRouter, type Request } from "express";
import { createHash } from "crypto";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import {
  db,
  matchupVotesTable,
  voteRateLimitsTable,
  matchupsTable,
  matchupSuggestionsTable,
  suggestionVotesTable,
  weeklyProcessingTable,
  weeklyResultsTable,
  dailyAdRewardsTable,
} from "@workspace/db";
import { GetVotesParams, CastVoteParams, CastVoteBody } from "@workspace/api-zod";
import { reqT } from "../lib/i18n";

const router: IRouter = Router();

const DEFAULT_WIN_THRESHOLD = 100;
const VOTE_COOLDOWN_MS = 3_600_000;
const MAX_DAILY_AD_REWARDS = 3;

const PROMO_PALETTES = [
  { leftColor: "#f43f5e", rightColor: "#8b5cf6" },
  { leftColor: "#10b981", rightColor: "#f59e0b" },
  { leftColor: "#06b6d4", rightColor: "#ec4899" },
  { leftColor: "#84cc16", rightColor: "#f97316" },
  { leftColor: "#a78bfa", rightColor: "#fb923c" },
];

function toSlug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// Returns the ISO date of the Monday that starts the current week (e.g. "2026-05-11")
function currentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip ?? "unknown";
}

async function getOrCreateVoteRow(matchupId: string, voteDate: string) {
  const existing = await db
    .select()
    .from(matchupVotesTable)
    .where(
      and(
        eq(matchupVotesTable.matchupId, matchupId),
        eq(matchupVotesTable.voteDate, voteDate),
      ),
    )
    .limit(1);

  if (existing.length > 0) return existing[0];

  const inserted = await db
    .insert(matchupVotesTable)
    .values({ matchupId, voteDate, offset: 0, leftPulls: 0, rightPulls: 0 })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) return inserted[0];

  const retry = await db
    .select()
    .from(matchupVotesTable)
    .where(
      and(
        eq(matchupVotesTable.matchupId, matchupId),
        eq(matchupVotesTable.voteDate, voteDate),
      ),
    )
    .limit(1);

  return retry[0];
}

async function getMatchupThreshold(matchupId: string): Promise<number> {
  const matchup = await db
    .select({ winThreshold: matchupsTable.winThreshold })
    .from(matchupsTable)
    .where(eq(matchupsTable.id, matchupId))
    .limit(1);
  return matchup[0]?.winThreshold ?? DEFAULT_WIN_THRESHOLD;
}

function rowToState(
  row: typeof matchupVotesTable.$inferSelect,
  matchupId: string,
  winThreshold: number
) {
  return {
    matchupId,
    offset: row.offset,
    leftPulls: row.leftPulls,
    rightPulls: row.rightPulls,
    voteDate: row.voteDate,
    winThreshold,
  };
}

// Increment wins for a matchup side and set weekWinner on the vote row
async function recordWin(matchupId: string, voteDate: string, side: "left" | "right") {
  await db
    .update(matchupVotesTable)
    .set({ weekWinner: side })
    .where(
      and(
        eq(matchupVotesTable.matchupId, matchupId),
        eq(matchupVotesTable.voteDate, voteDate),
      ),
    );

  if (side === "left") {
    await db
      .update(matchupsTable)
      .set({ leftWins: sql`${matchupsTable.leftWins} + 1` })
      .where(eq(matchupsTable.id, matchupId));
  } else {
    await db
      .update(matchupsTable)
      .set({ rightWins: sql`${matchupsTable.rightWins} + 1` })
      .where(eq(matchupsTable.id, matchupId));
  }
}

/** Clamp offset to [-threshold, +threshold] */
function clampOffset(offset: number, threshold: number) {
  return Math.max(-threshold, Math.min(threshold, offset));
}

async function demoteLeastVotedActiveMatchup(voteDate: string) {
  const activeRows = await db
    .select()
    .from(matchupsTable)
    .where(eq(matchupsTable.isActive, true));

  if (activeRows.length === 0) return;

  // Find the active matchup with the fewest total votes this week
  const voteRows = await db
    .select()
    .from(matchupVotesTable)
    .where(
      and(
        eq(matchupVotesTable.voteDate, voteDate),
        isNull(matchupVotesTable.weekWinner),
      ),
    );

  const voteMap = new Map(voteRows.map((v) => [v.matchupId, v.leftPulls + v.rightPulls]));
  const sorted = activeRows
    .map((m) => ({
      ...m,
      totalVotes: voteMap.get(m.id) ?? 0,
    }))
    .sort((a, b) => a.totalVotes - b.totalVotes);

  const demoted = sorted[0];
  if (!demoted) return;

  // Mark as inactive
  await db
    .update(matchupsTable)
    .set({ isActive: false })
    .where(eq(matchupsTable.id, demoted.id));

  // Move back to suggestions (marked as "demoted" so weekly cleanup preserves it)
  await db
    .insert(matchupSuggestionsTable)
    .values({
      leftTeam: demoted.leftTeam,
      rightTeam: demoted.rightTeam,
      source: "demoted",
    })
    .onConflictDoNothing();
}

// Run end-of-week processing: finalize winners, demote least voted, promote top suggestion
async function runWeeklyProcessing(previousWeek: string) {
  const thisWeek = currentWeekStart();

  // 1. Finalize any undecided previous-week rows
  const prevRows = await db
    .select()
    .from(matchupVotesTable)
    .where(
      and(
        eq(matchupVotesTable.voteDate, previousWeek),
        isNull(matchupVotesTable.weekWinner),
      ),
    );

  for (const row of prevRows) {
    if (row.offset < 0) {
      await recordWin(row.matchupId, previousWeek, "left");
    } else if (row.offset > 0) {
      await recordWin(row.matchupId, previousWeek, "right");
    }
  }

  // 3. Archive the completed week's results for every matchup
  const allMatchups = await db.select().from(matchupsTable);
  const matchupMap = new Map(allMatchups.map((m) => [m.id, m]));
  const voteRows = await db
    .select()
    .from(matchupVotesTable)
    .where(eq(matchupVotesTable.voteDate, previousWeek));

  for (const row of voteRows) {
    const m = matchupMap.get(row.matchupId);
    if (!m) continue;
    await db.insert(weeklyResultsTable).values({
      matchupId: row.matchupId,
      weekStartDate: previousWeek,
      leftTeam: m.leftTeam,
      rightTeam: m.rightTeam,
      leftPulls: row.leftPulls,
      rightPulls: row.rightPulls,
      totalPulls: row.leftPulls + row.rightPulls,
      offset: row.offset,
      winnerSide: row.weekWinner,
      leftWins: m.leftWins,
      rightWins: m.rightWins,
    });
  }

  // 4. If there are >= 5 active matchups, demote the least voted one
  const activeCount = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(matchupsTable)
    .where(eq(matchupsTable.isActive, true));
  if ((activeCount[0]?.n ?? 0) >= 5) {
    await demoteLeastVotedActiveMatchup(thisWeek);
  }

  // 5. Promote top non-promoted suggestion
  const topSuggestions = await db
    .select({
      id: matchupSuggestionsTable.id,
      leftTeam: matchupSuggestionsTable.leftTeam,
      rightTeam: matchupSuggestionsTable.rightTeam,
      votes: sql<number>`cast(count(${suggestionVotesTable.id}) as int)`,
    })
    .from(matchupSuggestionsTable)
    .leftJoin(
      suggestionVotesTable,
      eq(matchupSuggestionsTable.id, suggestionVotesTable.suggestionId),
    )
    .where(isNull(matchupSuggestionsTable.promotedAt))
    .groupBy(matchupSuggestionsTable.id)
    .orderBy(desc(sql`count(${suggestionVotesTable.id})`))
    .limit(1);

  if (topSuggestions.length > 0 && topSuggestions[0].votes > 0) {
    const top = topSuggestions[0];
    const promotedCount = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(matchupSuggestionsTable)
      .where(isNull(matchupSuggestionsTable.promotedAt));
    const idx = ((promotedCount[0]?.n ?? 0)) % PROMO_PALETTES.length;
    const palette = PROMO_PALETTES[idx];
    const slug = `${toSlug(top.leftTeam)}-${toSlug(top.rightTeam)}`;
    const existingMatchups = await db.select({ n: sql<number>`cast(count(*) as int)` }).from(matchupsTable);
    const sortOrder = (existingMatchups[0]?.n ?? 0) + 1;

    await db
      .insert(matchupsTable)
      .values({
        id: slug,
        leftTeam: top.leftTeam,
        rightTeam: top.rightTeam,
        leftColor: palette.leftColor,
        rightColor: palette.rightColor,
        emoji: "⚔️",
        sortOrder,
        isActive: true,
        source: "user",
      })
      .onConflictDoNothing();

    await db
      .update(matchupSuggestionsTable)
      .set({ promotedAt: new Date() })
      .where(eq(matchupSuggestionsTable.id, top.id));

    // After promoting, if still >= 5, demote one more
    const activeCountAfter = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(matchupsTable)
      .where(eq(matchupsTable.isActive, true));
    if ((activeCountAfter[0]?.n ?? 0) > 5) {
      await demoteLeastVotedActiveMatchup(thisWeek);
    }
  }

  // 4. Reset cumulative win counts for all matchups
  await db.update(matchupsTable).set({ leftWins: 0, rightWins: 0 });

  // 5. Reset suggestion list — only delete user-submitted ones, keep demoted matchups
  await db
    .delete(matchupSuggestionsTable)
    .where(eq(matchupSuggestionsTable.source, "user"));

  // 6. Update lastProcessedWeek
  const existing = await db.select().from(weeklyProcessingTable).limit(1);
  if (existing.length > 0) {
    await db
      .update(weeklyProcessingTable)
      .set({ lastProcessedWeek: currentWeekStart() })
      .where(eq(weeklyProcessingTable.id, existing[0].id));
  } else {
    await db.insert(weeklyProcessingTable).values({ lastProcessedWeek: currentWeekStart() });
  }
}

// Check if weekly processing needs to run (called on each vote)
async function maybeRunWeeklyProcessing() {
  const row = await db.select().from(weeklyProcessingTable).limit(1);
  const lastProcessed = row.length > 0 ? row[0].lastProcessedWeek : null;
  const thisWeek = currentWeekStart();

  if (lastProcessed === null || lastProcessed < thisWeek) {
    const previousWeek = lastProcessed ?? thisWeek;
    await runWeeklyProcessing(previousWeek);
  }
}

// GET /api/votes/:matchupId
router.get("/:matchupId", async (req, res) => {
  const parsed = GetVotesParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: reqT(req, "invalidMatchupId") });
    return;
  }
  const { matchupId } = parsed.data;
  const voteDate = currentWeekStart();

  const row = await getOrCreateVoteRow(matchupId, voteDate);
  const winThreshold = await getMatchupThreshold(matchupId);
  res.json(rowToState(row, matchupId, winThreshold));
});

// POST /api/votes/:matchupId
router.post("/:matchupId", async (req, res) => {
  const paramsParsed = CastVoteParams.safeParse(req.params);
  const bodyParsed = CastVoteBody.safeParse(req.body);

  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: reqT(req, "invalidRequest") });
    return;
  }

  const { matchupId } = paramsParsed.data;
  const { side } = bodyParsed.data;
  const voteDate = currentWeekStart();
  const ipHash = hashIp(getClientIp(req));
  const now = new Date();

  // Run weekly processing if needed (fire and forget errors)
  try {
    await maybeRunWeeklyProcessing();
  } catch { /* non-fatal */ }

  // Check rate limit
  const rateRow = await db
    .select()
    .from(voteRateLimitsTable)
    .where(
      and(
        eq(voteRateLimitsTable.ipHash, ipHash),
        eq(voteRateLimitsTable.matchupId, matchupId),
      ),
    )
    .limit(1);

  const winThreshold = await getMatchupThreshold(matchupId);

  if (rateRow.length > 0) {
    const msSinceLastVote = now.getTime() - rateRow[0].lastVoteAt.getTime();
    if (msSinceLastVote < VOTE_COOLDOWN_MS) {
      const cooldownSeconds = Math.ceil((VOTE_COOLDOWN_MS - msSinceLastVote) / 1000);
      const row = await getOrCreateVoteRow(matchupId, voteDate);
      res.json({ ...rowToState(row, matchupId, winThreshold), accepted: false, cooldownSeconds });
      return;
    }
  }

  const row = await getOrCreateVoteRow(matchupId, voteDate);

  const delta = side === "left" ? -1 : 1;
  const newOffset = clampOffset(row.offset + delta, winThreshold);
  const pullCol = side === "left" ? matchupVotesTable.leftPulls : matchupVotesTable.rightPulls;

  const updated = await db
    .update(matchupVotesTable)
    .set({
      offset: newOffset,
      [side === "left" ? "leftPulls" : "rightPulls"]: sql`${pullCol} + 1`,
    })
    .where(
      and(
        eq(matchupVotesTable.matchupId, matchupId),
        eq(matchupVotesTable.voteDate, voteDate),
      ),
    )
    .returning();

  const newRow = updated[0];

  // Record a win if threshold is hit for the first time this week
  if (newRow.weekWinner === null) {
    if (newOffset <= -winThreshold) {
      await recordWin(matchupId, voteDate, "left");
    } else if (newOffset >= winThreshold) {
      await recordWin(matchupId, voteDate, "right");
    }
  }

  // Upsert rate limit record
  if (rateRow.length > 0) {
    await db
      .update(voteRateLimitsTable)
      .set({ lastVoteAt: now })
      .where(eq(voteRateLimitsTable.id, rateRow[0].id));
  } else {
    await db
      .insert(voteRateLimitsTable)
      .values({ ipHash, matchupId, lastVoteAt: now });
  }

  res.json({ ...rowToState(newRow, matchupId, winThreshold), accepted: true, cooldownSeconds: null });
});

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getDailyAdRewardCount(ipHash: string): Promise<number> {
  const rows = await db
    .select()
    .from(dailyAdRewardsTable)
    .where(
      and(
        eq(dailyAdRewardsTable.ipHash, ipHash),
        eq(dailyAdRewardsTable.rewardDate, todayDate()),
      ),
    )
    .limit(1);
  return rows[0]?.count ?? 0;
}

async function incrementDailyAdReward(ipHash: string) {
  const existing = await db
    .select()
    .from(dailyAdRewardsTable)
    .where(
      and(
        eq(dailyAdRewardsTable.ipHash, ipHash),
        eq(dailyAdRewardsTable.rewardDate, todayDate()),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(dailyAdRewardsTable)
      .set({ count: sql`${dailyAdRewardsTable.count} + 1` })
      .where(eq(dailyAdRewardsTable.id, existing[0].id));
  } else {
    await db.insert(dailyAdRewardsTable).values({
      ipHash,
      rewardDate: todayDate(),
      count: 1,
    });
  }
}

// GET /api/votes/:matchupId/reward-limit — check remaining daily ad rewards
router.get("/:matchupId/reward-limit", async (req, res) => {
  const ipHash = hashIp(getClientIp(req));
  const used = await getDailyAdRewardCount(ipHash);
  res.json({ used, remaining: Math.max(0, MAX_DAILY_AD_REWARDS - used), max: MAX_DAILY_AD_REWARDS });
});

// POST /api/votes/:matchupId/reward — skip cooldown by clearing rate limit (max 3/day)
router.post("/:matchupId/reward", async (req, res) => {
  const paramsParsed = CastVoteParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: reqT(req, "invalidRequest") });
    return;
  }
  const { matchupId } = paramsParsed.data;
  const ipHash = hashIp(getClientIp(req));
  const used = await getDailyAdRewardCount(ipHash);

  if (used >= MAX_DAILY_AD_REWARDS) {
    res.status(429).json({ error: reqT(req, "dailyAdLimitReached"), used, max: MAX_DAILY_AD_REWARDS });
    return;
  }

  await db
    .delete(voteRateLimitsTable)
    .where(
      and(
        eq(voteRateLimitsTable.ipHash, ipHash),
        eq(voteRateLimitsTable.matchupId, matchupId),
      ),
    );

  await incrementDailyAdReward(ipHash);

  res.json({ cleared: true, used: used + 1, remaining: Math.max(0, MAX_DAILY_AD_REWARDS - used - 1) });
});

export default router;
