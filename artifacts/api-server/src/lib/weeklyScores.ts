import { eq, and, sql, isNull, desc } from "drizzle-orm";
import {
  db,
  matchupsTable,
  matchupWeeklyScoresTable,
  matchupSuggestionsTable,
  suggestionVotesTable,
  weeklyProcessingTable,
  weeklyResultsTable,
} from "@workspace/db";
import {
  currentWeekStart,
  currentWeekEndDate,
  currentWeekEndsAt,
} from "./week";

export type BattleSide = "left" | "right";

export type MatchupBattleState = {
  matchupId: string;
  weekStartDate: string;
  weekEndDate: string;
  weekEndsAt: string;
  leftPoints: number;
  rightPoints: number;
  totalPoints: number;
  leftPercentage: number;
  rightPercentage: number;
  leaderSide: BattleSide | null;
  isDraw: boolean;
};

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

function asNonNegInt(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Derive percentages from points.
 * Zero total → 50/50. Otherwise round to 1 decimal and normalize so the pair
 * sums to 100.0 (avoids 52.4 + 47.5 = 99.9 style display bugs).
 */
export function derivePercentages(
  leftPoints: number,
  rightPoints: number,
): { leftPercentage: number; rightPercentage: number } {
  const left = asNonNegInt(leftPoints);
  const right = asNonNegInt(rightPoints);
  const total = left + right;
  if (total === 0) {
    return { leftPercentage: 50, rightPercentage: 50 };
  }
  const leftPct = Math.round((left / total) * 1000) / 10;
  const rightPct = Math.round((100 - leftPct) * 10) / 10;
  return { leftPercentage: leftPct, rightPercentage: rightPct };
}

export function deriveLeader(
  leftPoints: number,
  rightPoints: number,
): { leaderSide: BattleSide | null; isDraw: boolean } {
  const left = asNonNegInt(leftPoints);
  const right = asNonNegInt(rightPoints);
  if (left === right) return { leaderSide: null, isDraw: true };
  return { leaderSide: left > right ? "left" : "right", isDraw: false };
}

export function scoreRowToBattleState(
  matchupId: string,
  weekStartDate: string,
  leftPoints: number,
  rightPoints: number,
): MatchupBattleState {
  const left = asNonNegInt(leftPoints);
  const right = asNonNegInt(rightPoints);
  const total = left + right;
  const { leftPercentage, rightPercentage } = derivePercentages(left, right);
  const { leaderSide, isDraw } = deriveLeader(left, right);
  return {
    matchupId,
    weekStartDate,
    weekEndDate: currentWeekEndDate(),
    weekEndsAt: currentWeekEndsAt().toISOString(),
    leftPoints: left,
    rightPoints: right,
    totalPoints: total,
    leftPercentage,
    rightPercentage,
    leaderSide,
    isDraw,
  };
}

export async function getOrCreateWeeklyScore(matchupId: string, weekStartDate?: string) {
  const week = weekStartDate ?? currentWeekStart();

  const existing = await db
    .select()
    .from(matchupWeeklyScoresTable)
    .where(
      and(
        eq(matchupWeeklyScoresTable.matchupId, matchupId),
        eq(matchupWeeklyScoresTable.weekStartDate, week),
      ),
    )
    .limit(1);

  if (existing.length > 0) return existing[0];

  const inserted = await db
    .insert(matchupWeeklyScoresTable)
    .values({
      matchupId,
      weekStartDate: week,
      leftPoints: 0,
      rightPoints: 0,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) return inserted[0];

  const retry = await db
    .select()
    .from(matchupWeeklyScoresTable)
    .where(
      and(
        eq(matchupWeeklyScoresTable.matchupId, matchupId),
        eq(matchupWeeklyScoresTable.weekStartDate, week),
      ),
    )
    .limit(1);

  return retry[0];
}

export async function getMatchupBattleState(matchupId: string): Promise<MatchupBattleState | null> {
  const matchup = await db
    .select({ id: matchupsTable.id })
    .from(matchupsTable)
    .where(eq(matchupsTable.id, matchupId))
    .limit(1);

  if (matchup.length === 0) return null;

  const week = currentWeekStart();
  const row = await getOrCreateWeeklyScore(matchupId, week);
  return scoreRowToBattleState(
    matchupId,
    week,
    row.leftPoints,
    row.rightPoints,
  );
}

/**
 * Future entry point for server-authoritative challenge awards.
 * NOT exposed as a public "submit arbitrary points" endpoint.
 * Do not call from placeholder UI.
 */
export async function awardChallengePoints(params: {
  matchupId: string;
  side: BattleSide;
  points: number;
}): Promise<MatchupBattleState> {
  const points = asNonNegInt(params.points);
  if (points <= 0) {
    const state = await getMatchupBattleState(params.matchupId);
    if (!state) throw new Error("matchup_not_found");
    return state;
  }

  const week = currentWeekStart();
  await getOrCreateWeeklyScore(params.matchupId, week);

  const column =
    params.side === "left"
      ? matchupWeeklyScoresTable.leftPoints
      : matchupWeeklyScoresTable.rightPoints;

  const updated = await db
    .update(matchupWeeklyScoresTable)
    .set({
      [params.side === "left" ? "leftPoints" : "rightPoints"]: sql`${column} + ${points}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(matchupWeeklyScoresTable.matchupId, params.matchupId),
        eq(matchupWeeklyScoresTable.weekStartDate, week),
      ),
    )
    .returning();

  const row = updated[0];
  return scoreRowToBattleState(params.matchupId, week, row.leftPoints, row.rightPoints);
}

async function recordCumulativeWin(matchupId: string, side: BattleSide) {
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

function winnerFromPoints(leftPoints: number, rightPoints: number): "left" | "right" | "draw" {
  if (leftPoints > rightPoints) return "left";
  if (rightPoints > leftPoints) return "right";
  return "draw";
}

async function demoteLeastActiveMatchup(weekStartDate: string) {
  const activeRows = await db
    .select()
    .from(matchupsTable)
    .where(eq(matchupsTable.isActive, true));

  if (activeRows.length === 0) return;

  const scoreRows = await db
    .select()
    .from(matchupWeeklyScoresTable)
    .where(eq(matchupWeeklyScoresTable.weekStartDate, weekStartDate));

  const scoreMap = new Map(
    scoreRows.map((s) => [s.matchupId, asNonNegInt(s.leftPoints) + asNonNegInt(s.rightPoints)]),
  );

  const sorted = activeRows
    .map((m) => ({
      ...m,
      totalPoints: scoreMap.get(m.id) ?? 0,
    }))
    .sort((a, b) => a.totalPoints - b.totalPoints);

  const demoted = sorted[0];
  if (!demoted) return;

  await db
    .update(matchupsTable)
    .set({ isActive: false })
    .where(eq(matchupsTable.id, demoted.id));

  await db
    .insert(matchupSuggestionsTable)
    .values({
      leftTeam: demoted.leftTeam,
      rightTeam: demoted.rightTeam,
      source: "demoted",
    })
    .onConflictDoNothing();
}

/**
 * End-of-week processing based on accumulated points (not legacy offset).
 * Idempotent for weekly_results via unique (matchupId, weekStartDate).
 */
export async function runWeeklyProcessing(previousWeek: string) {
  const thisWeek = currentWeekStart();

  const allMatchups = await db.select().from(matchupsTable);
  const matchupMap = new Map(allMatchups.map((m) => [m.id, m]));

  const scoreRows = await db
    .select()
    .from(matchupWeeklyScoresTable)
    .where(eq(matchupWeeklyScoresTable.weekStartDate, previousWeek));

  for (const row of scoreRows) {
    const m = matchupMap.get(row.matchupId);
    if (!m) continue;

    const leftPoints = asNonNegInt(row.leftPoints);
    const rightPoints = asNonNegInt(row.rightPoints);
    const totalPoints = leftPoints + rightPoints;
    const winnerSide = winnerFromPoints(leftPoints, rightPoints);

    if (winnerSide === "left" || winnerSide === "right") {
      await recordCumulativeWin(row.matchupId, winnerSide);
    }

    // Re-read wins after possible increment
    const refreshed = await db
      .select({ leftWins: matchupsTable.leftWins, rightWins: matchupsTable.rightWins })
      .from(matchupsTable)
      .where(eq(matchupsTable.id, row.matchupId))
      .limit(1);

    await db
      .insert(weeklyResultsTable)
      .values({
        matchupId: row.matchupId,
        weekStartDate: previousWeek,
        leftTeam: m.leftTeam,
        rightTeam: m.rightTeam,
        leftPulls: 0,
        rightPulls: 0,
        totalPulls: 0,
        offset: 0,
        leftPoints,
        rightPoints,
        totalPoints,
        winnerSide,
        leftWins: refreshed[0]?.leftWins ?? m.leftWins,
        rightWins: refreshed[0]?.rightWins ?? m.rightWins,
      })
      .onConflictDoNothing();
  }

  const activeCount = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(matchupsTable)
    .where(eq(matchupsTable.isActive, true));
  if ((activeCount[0]?.n ?? 0) >= 5) {
    await demoteLeastActiveMatchup(thisWeek);
  }

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
    const pendingCount = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(matchupSuggestionsTable)
      .where(isNull(matchupSuggestionsTable.promotedAt));
    const idx = (pendingCount[0]?.n ?? 0) % PROMO_PALETTES.length;
    const palette = PROMO_PALETTES[idx];
    const slug = `${toSlug(top.leftTeam)}-${toSlug(top.rightTeam)}`;
    const existingMatchups = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(matchupsTable);
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

    const activeCountAfter = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(matchupsTable)
      .where(eq(matchupsTable.isActive, true));
    if ((activeCountAfter[0]?.n ?? 0) > 5) {
      await demoteLeastActiveMatchup(thisWeek);
    }
  }

  await db.update(matchupsTable).set({ leftWins: 0, rightWins: 0 });

  await db
    .delete(matchupSuggestionsTable)
    .where(eq(matchupSuggestionsTable.source, "user"));

  const existing = await db.select().from(weeklyProcessingTable).limit(1);
  if (existing.length > 0) {
    await db
      .update(weeklyProcessingTable)
      .set({ lastProcessedWeek: thisWeek })
      .where(eq(weeklyProcessingTable.id, existing[0].id));
  } else {
    await db.insert(weeklyProcessingTable).values({ lastProcessedWeek: thisWeek });
  }
}

export async function maybeRunWeeklyProcessing(): Promise<void> {
  const row = await db.select().from(weeklyProcessingTable).limit(1);
  const lastProcessed = row.length > 0 ? row[0].lastProcessedWeek : null;
  const thisWeek = currentWeekStart();

  if (lastProcessed === null || lastProcessed < thisWeek) {
    const previousWeek = lastProcessed ?? thisWeek;
    await runWeeklyProcessing(previousWeek);
  }
}
