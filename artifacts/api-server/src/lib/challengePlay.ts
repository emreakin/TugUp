/**
 * Online challenge play: signed sessions, cooldown, scoring, x2 claims.
 *
 * Rapid Pull: 15s tap race. Score = tap count (~80–120 typical).
 * Heavy Pull: 10s tug vs resistance bursts. Score = final position 0–100 (~25–50 typical).
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  matchupsTable,
  onlineChallengeUserStateTable,
  onlineDailyX2UsageTable,
  onlineX2ClaimsTable,
} from "@workspace/db";
import {
  ONLINE_CHALLENGES,
  ONLINE_COOLDOWNS_ENABLED,
  ONLINE_DAILY_X2_MAX,
  effectiveCooldownSeconds,
  isOnlineChallengeType,
  remainingDailyX2,
  type OnlineChallengeType,
} from "./onlineChallenges";
import { awardChallengePoints, type BattleSide, type MatchupBattleState } from "./weeklyScores";
import { utcToday } from "./week";

export const RAPID_PULL_DURATION_MS = 15_000;
export const RAPID_PULL_MIN_ELAPSED_MS = 13_500;
export const RAPID_PULL_MAX_ELAPSED_MS = 22_000;
export const RAPID_PULL_MAX_TAPS = 270;

/** Heavy Pull: slower tug with periodic snap-back resistance. */
export const HEAVY_PULL_DURATION_MS = 10_000;
export const HEAVY_PULL_MIN_ELAPSED_MS = 10_000;
export const HEAVY_PULL_MAX_ELAPSED_MS = 18_000;
export const HEAVY_PULL_UNIT_PER_TAP = 1.8;
export const HEAVY_PULL_MAX_POSITION = 100;
export const HEAVY_PULL_MAX_TAPS = 200;
/** Client-side feel constants (mirrored on mobile). */
export const HEAVY_PULL_BURST_INTERVAL_MS = 2_500;
export const HEAVY_PULL_BURST_SNAP = 8;

const PLAY_TOKEN_TTL_MS = 90_000;
const X2_CLAIM_TTL_MS = 5 * 60_000;

const IMPLEMENTED: OnlineChallengeType[] = ["rapid_pull", "heavy_pull"];

function durationFor(type: OnlineChallengeType): number {
  if (type === "heavy_pull") return HEAVY_PULL_DURATION_MS;
  return RAPID_PULL_DURATION_MS;
}

function elapsedBounds(type: OnlineChallengeType): { min: number; max: number } {
  if (type === "heavy_pull") {
    return { min: HEAVY_PULL_MIN_ELAPSED_MS, max: HEAVY_PULL_MAX_ELAPSED_MS };
  }
  return { min: RAPID_PULL_MIN_ELAPSED_MS, max: RAPID_PULL_MAX_ELAPSED_MS };
}

function getSecret(): string {
  return process.env.JWT_SECRET ?? "tugup-dev-secret-change-in-production";
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function packToken(payloadObj: Record<string, unknown>): string {
  const payload = JSON.stringify(payloadObj);
  const sig = signPayload(payload);
  return Buffer.from(`${payload}\n${sig}`).toString("base64url");
}

function unpackToken(token: string): Record<string, unknown> | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const nl = decoded.lastIndexOf("\n");
    if (nl === -1) return null;
    const payload = decoded.slice(0, nl);
    const sig = decoded.slice(nl + 1);
    const expected = signPayload(payload);
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type ChallengeStatusEntry = {
  available: boolean;
  cooldownSeconds: number;
  cooldownEndsAt: string | null;
  secondsRemaining: number;
};

export async function getChallengeStatusesForUser(
  userId: string,
  matchupId: string,
): Promise<Record<OnlineChallengeType, ChallengeStatusEntry>> {
  const rows = await db
    .select()
    .from(onlineChallengeUserStateTable)
    .where(
      and(
        eq(onlineChallengeUserStateTable.userId, userId),
        eq(onlineChallengeUserStateTable.matchupId, matchupId),
      ),
    );

  const byType = new Map(rows.map((r) => [r.challengeType, r]));
  const now = Date.now();
  const out = {} as Record<OnlineChallengeType, ChallengeStatusEntry>;

  for (const type of Object.keys(ONLINE_CHALLENGES) as OnlineChallengeType[]) {
    const cooldownSec = effectiveCooldownSeconds(type);
    const row = byType.get(type);
    const last = row?.lastPlayedAt ? row.lastPlayedAt.getTime() : null;
    const endsAt =
      last != null && cooldownSec > 0 ? last + cooldownSec * 1000 : null;
    const remaining =
      endsAt != null ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;

    out[type] = {
      available: !ONLINE_COOLDOWNS_ENABLED || remaining === 0,
      cooldownSeconds: cooldownSec,
      cooldownEndsAt: endsAt != null && remaining > 0 ? new Date(endsAt).toISOString() : null,
      secondsRemaining: ONLINE_COOLDOWNS_ENABLED ? remaining : 0,
    };
  }
  return out;
}

async function assertCooldownClear(
  userId: string,
  matchupId: string,
  challengeType: OnlineChallengeType,
): Promise<void> {
  if (!ONLINE_COOLDOWNS_ENABLED) return;
  const statuses = await getChallengeStatusesForUser(userId, matchupId);
  const status = statuses[challengeType];
  if (!status.available) {
    const err = new Error("cooldown_active") as Error & {
      secondsRemaining?: number;
      cooldownEndsAt?: string | null;
    };
    err.secondsRemaining = status.secondsRemaining;
    err.cooldownEndsAt = status.cooldownEndsAt;
    throw err;
  }
}

export async function startChallenge(params: {
  userId: string;
  matchupId: string;
  side: BattleSide;
  challengeType: OnlineChallengeType;
}): Promise<{
  playToken: string;
  challengeType: OnlineChallengeType;
  durationMs: number;
  startedAt: number;
}> {
  if (!IMPLEMENTED.includes(params.challengeType)) {
    throw new Error("challenge_not_implemented");
  }

  const matchup = await db
    .select({ id: matchupsTable.id, isActive: matchupsTable.isActive })
    .from(matchupsTable)
    .where(eq(matchupsTable.id, params.matchupId))
    .limit(1);
  if (matchup.length === 0) throw new Error("matchup_not_found");
  if (!matchup[0].isActive) throw new Error("matchup_inactive");

  await assertCooldownClear(params.userId, params.matchupId, params.challengeType);

  const startedAt = Date.now();
  const playToken = packToken({
    v: 1,
    kind: "play",
    userId: params.userId,
    matchupId: params.matchupId,
    side: params.side,
    challengeType: params.challengeType,
    startedAt,
    nonce: randomBytes(8).toString("hex"),
  });

  return {
    playToken,
    challengeType: params.challengeType,
    durationMs: durationFor(params.challengeType),
    startedAt,
  };
}

function scoreRapidPull(tapCount: number): number {
  const taps = Math.max(0, Math.floor(tapCount));
  return Math.min(taps, RAPID_PULL_MAX_TAPS);
}

/**
 * Heavy Pull score = final pull position, capped by tap economics so clients
 * cannot invent progress without taps. Resistance is client feel; cheat ceiling
 * is still tapCount * UNIT.
 */
function scoreHeavyPull(tapCount: number, finalPosition: number): number {
  const taps = Math.max(0, Math.floor(tapCount));
  if (taps > HEAVY_PULL_MAX_TAPS) throw new Error("tap_count_invalid");
  const claimed = Math.max(0, Math.floor(finalPosition));
  const maxByTaps = Math.floor(taps * HEAVY_PULL_UNIT_PER_TAP + 0.0001);
  const capped = Math.min(claimed, maxByTaps, HEAVY_PULL_MAX_POSITION);
  return Math.max(0, capped);
}

async function bumpChallengeUserState(
  userId: string,
  matchupId: string,
  challengeType: OnlineChallengeType,
): Promise<void> {
  const now = new Date();
  const existing = await db
    .select()
    .from(onlineChallengeUserStateTable)
    .where(
      and(
        eq(onlineChallengeUserStateTable.userId, userId),
        eq(onlineChallengeUserStateTable.matchupId, matchupId),
        eq(onlineChallengeUserStateTable.challengeType, challengeType),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(onlineChallengeUserStateTable)
      .set({
        lastPlayedAt: now,
        playCount: sql`${onlineChallengeUserStateTable.playCount} + 1`,
        updatedAt: now,
      })
      .where(eq(onlineChallengeUserStateTable.id, existing[0].id));
  } else {
    await db.insert(onlineChallengeUserStateTable).values({
      userId,
      matchupId,
      challengeType,
      lastPlayedAt: now,
      playCount: 1,
      updatedAt: now,
    });
  }
}

async function getDailyX2Used(userId: string): Promise<number> {
  const rows = await db
    .select()
    .from(onlineDailyX2UsageTable)
    .where(
      and(
        eq(onlineDailyX2UsageTable.userId, userId),
        eq(onlineDailyX2UsageTable.rewardDate, utcToday()),
      ),
    )
    .limit(1);
  return rows[0]?.count ?? 0;
}

async function incrementDailyX2(userId: string): Promise<number> {
  const today = utcToday();
  const existing = await db
    .select()
    .from(onlineDailyX2UsageTable)
    .where(
      and(
        eq(onlineDailyX2UsageTable.userId, userId),
        eq(onlineDailyX2UsageTable.rewardDate, today),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const updated = await db
      .update(onlineDailyX2UsageTable)
      .set({
        count: sql`${onlineDailyX2UsageTable.count} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(onlineDailyX2UsageTable.id, existing[0].id))
      .returning();
    return updated[0].count;
  }

  const inserted = await db
    .insert(onlineDailyX2UsageTable)
    .values({ userId, rewardDate: today, count: 1 })
    .returning();
  return inserted[0].count;
}

export async function completeChallenge(params: {
  userId: string;
  playToken: string;
  tapCount: number;
  /** Heavy Pull final position 0–100. Ignored for Rapid Pull. */
  finalPosition?: number;
}): Promise<{
  pointsAwarded: number;
  tapCount: number;
  finalPosition: number | null;
  battleState: MatchupBattleState;
  canClaimX2: boolean;
  x2ClaimToken: string | null;
  x2RemainingToday: number;
  cooldownEndsAt: string;
  challengeType: OnlineChallengeType;
  side: BattleSide;
}> {
  const payload = unpackToken(params.playToken);
  if (!payload || payload.kind !== "play" || payload.userId !== params.userId) {
    throw new Error("invalid_play_token");
  }

  const challengeType = String(payload.challengeType ?? "");
  if (!isOnlineChallengeType(challengeType) || !IMPLEMENTED.includes(challengeType)) {
    throw new Error("invalid_play_token");
  }

  const matchupId = String(payload.matchupId ?? "");
  const side = payload.side === "right" ? "right" : payload.side === "left" ? "left" : null;
  const startedAt = Number(payload.startedAt);
  if (!matchupId || !side || !Number.isFinite(startedAt)) {
    throw new Error("invalid_play_token");
  }

  const bounds = elapsedBounds(challengeType);
  if (Date.now() - startedAt > PLAY_TOKEN_TTL_MS + bounds.max) {
    throw new Error("play_token_expired");
  }

  const elapsed = Date.now() - startedAt;
  if (elapsed < bounds.min) throw new Error("challenge_too_fast");
  if (elapsed > bounds.max) throw new Error("challenge_too_slow");

  await assertCooldownClear(params.userId, matchupId, challengeType);

  const tapCount = Math.max(0, Math.floor(Number(params.tapCount) || 0));
  let pointsAwarded = 0;
  let finalPosition: number | null = null;

  if (challengeType === "rapid_pull") {
    if (tapCount > RAPID_PULL_MAX_TAPS) throw new Error("tap_count_invalid");
    pointsAwarded = scoreRapidPull(tapCount);
  } else if (challengeType === "heavy_pull") {
    const pos = Number(params.finalPosition);
    if (!Number.isFinite(pos)) throw new Error("position_invalid");
    pointsAwarded = scoreHeavyPull(tapCount, pos);
    finalPosition = pointsAwarded;
  }

  const battleState = await awardChallengePoints({
    matchupId,
    side,
    points: pointsAwarded,
  });

  await bumpChallengeUserState(params.userId, matchupId, challengeType);

  const usedX2 = await getDailyX2Used(params.userId);
  const x2Left = remainingDailyX2(usedX2);
  const canClaimX2 =
    pointsAwarded > 0 &&
    ONLINE_CHALLENGES[challengeType].supportsDoubleReward &&
    x2Left > 0;

  const x2ClaimToken = canClaimX2
    ? packToken({
        v: 1,
        kind: "x2",
        userId: params.userId,
        matchupId,
        side,
        challengeType,
        basePoints: pointsAwarded,
        issuedAt: Date.now(),
        nonce: randomBytes(8).toString("hex"),
      })
    : null;

  const cooldownEndsAt = new Date(
    Date.now() + effectiveCooldownSeconds(challengeType) * 1000,
  ).toISOString();

  return {
    pointsAwarded,
    tapCount,
    finalPosition,
    battleState,
    canClaimX2,
    x2ClaimToken,
    x2RemainingToday: x2Left,
    cooldownEndsAt,
    challengeType,
    side,
  };
}

export async function claimChallengeX2(params: {
  userId: string;
  x2ClaimToken: string;
}): Promise<{
  bonusPoints: number;
  battleState: MatchupBattleState;
  x2RemainingToday: number;
}> {
  const payload = unpackToken(params.x2ClaimToken);
  if (!payload || payload.kind !== "x2" || payload.userId !== params.userId) {
    throw new Error("invalid_x2_token");
  }

  const issuedAt = Number(payload.issuedAt);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > X2_CLAIM_TTL_MS) {
    throw new Error("x2_token_expired");
  }

  const matchupId = String(payload.matchupId ?? "");
  const side = payload.side === "right" ? "right" : payload.side === "left" ? "left" : null;
  const basePoints = Math.max(0, Math.floor(Number(payload.basePoints) || 0));
  if (!matchupId || !side || basePoints <= 0) {
    throw new Error("invalid_x2_token");
  }

  const used = await getDailyX2Used(params.userId);
  if (remainingDailyX2(used) <= 0) {
    throw new Error("x2_daily_limit");
  }

  const nonce = String(payload.nonce ?? "");
  if (!nonce) throw new Error("invalid_x2_token");

  try {
    await db.insert(onlineX2ClaimsTable).values({
      nonce,
      userId: params.userId,
    });
  } catch {
    throw new Error("x2_already_claimed");
  }

  const newCount = await incrementDailyX2(params.userId);
  if (newCount > ONLINE_DAILY_X2_MAX) {
    throw new Error("x2_daily_limit");
  }

  const battleState = await awardChallengePoints({
    matchupId,
    side,
    points: basePoints,
  });

  return {
    bonusPoints: basePoints,
    battleState,
    x2RemainingToday: remainingDailyX2(newCount),
  };
}
