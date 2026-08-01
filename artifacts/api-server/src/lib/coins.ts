import { eq, sql } from "drizzle-orm";
import { db, userWalletsTable, coinTransactionsTable, type UserWallet } from "@workspace/db";

/** Consecutive-day rewards: day 1→10 … day 5+→100 */
export const DAILY_REWARDS = [10, 25, 50, 75, 100] as const;

export type CoinReason = "daily_login" | "purchase" | "joker_purchase" | "admin" | "refund";

/** Fixed coin cost to unlock one Quick Game joker */
export const JOKER_COIN_COST = 25;

export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function utcYesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function asDateString(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** streakDay is 1-indexed (1 = first login day of streak) */
export function rewardForStreakDay(streakDay: number): number {
  if (streakDay <= 0) return DAILY_REWARDS[0];
  if (streakDay >= DAILY_REWARDS.length) {
    return DAILY_REWARDS[DAILY_REWARDS.length - 1];
  }
  return DAILY_REWARDS[streakDay - 1];
}

export async function getOrCreateWallet(userId: string): Promise<UserWallet> {
  const existing = await db
    .select()
    .from(userWalletsTable)
    .where(eq(userWalletsTable.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(userWalletsTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const again = await db
    .select()
    .from(userWalletsTable)
    .where(eq(userWalletsTable.userId, userId))
    .limit(1);
  return again[0]!;
}

export function walletStatus(wallet: UserWallet) {
  const today = utcToday();
  const yesterday = utcYesterday();
  const lastClaim = asDateString(wallet.lastDailyClaimDate);
  const alreadyClaimedToday = lastClaim === today;

  let nextStreak: number;
  if (alreadyClaimedToday) {
    nextStreak = wallet.dailyStreak;
  } else if (lastClaim === yesterday) {
    nextStreak = wallet.dailyStreak + 1;
  } else {
    nextStreak = 1;
  }

  return {
    balance: wallet.balance,
    dailyStreak: wallet.dailyStreak,
    lastDailyClaimDate: lastClaim,
    canClaimToday: !alreadyClaimedToday,
    nextReward: rewardForStreakDay(nextStreak),
    nextStreak,
  };
}

export async function creditCoins(
  userId: string,
  amount: number,
  reason: CoinReason,
): Promise<{ balance: number }> {
  if (amount <= 0) throw new Error("credit amount must be positive");

  return db.transaction(async (tx) => {
    await tx
      .insert(userWalletsTable)
      .values({ userId })
      .onConflictDoNothing();

    const [updated] = await tx
      .update(userWalletsTable)
      .set({
        balance: sql`${userWalletsTable.balance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userWalletsTable.userId, userId))
      .returning();

    if (!updated) throw new Error("wallet missing after credit");

    await tx.insert(coinTransactionsTable).values({
      userId,
      amount,
      reason,
      balanceAfter: updated.balance,
    });

    return { balance: updated.balance };
  });
}

export async function debitCoins(
  userId: string,
  amount: number,
  reason: CoinReason,
): Promise<{ balance: number }> {
  if (amount <= 0) throw new Error("debit amount must be positive");

  return db.transaction(async (tx) => {
    await tx
      .insert(userWalletsTable)
      .values({ userId })
      .onConflictDoNothing();

    const [updated] = await tx
      .update(userWalletsTable)
      .set({
        balance: sql`${userWalletsTable.balance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        sql`${userWalletsTable.userId} = ${userId} AND ${userWalletsTable.balance} >= ${amount}`,
      )
      .returning();

    if (!updated) {
      throw new InsufficientCoinsError();
    }

    await tx.insert(coinTransactionsTable).values({
      userId,
      amount: -amount,
      reason,
      balanceAfter: updated.balance,
    });

    return { balance: updated.balance };
  });
}

export class InsufficientCoinsError extends Error {
  constructor() {
    super("INSUFFICIENT_COINS");
    this.name = "InsufficientCoinsError";
  }
}

export type DailyClaimResult =
  | {
      claimed: true;
      reward: number;
      streak: number;
      balance: number;
    }
  | {
      claimed: false;
      reason: "already_claimed";
      streak: number;
      balance: number;
      nextReward: number;
    };

/**
 * Claim today's daily login reward.
 * Streak: 10 → 25 → 50 → 75 → 100 (then 100 while consecutive).
 * Missing a calendar day resets streak to day 1 (10 coins).
 */
export async function claimDailyLogin(userId: string): Promise<DailyClaimResult> {
  const today = utcToday();
  const yesterday = utcYesterday();

  return db.transaction(async (tx) => {
    await tx
      .insert(userWalletsTable)
      .values({ userId })
      .onConflictDoNothing();

    const rows = await tx
      .select()
      .from(userWalletsTable)
      .where(eq(userWalletsTable.userId, userId))
      .limit(1)
      .for("update");

    const wallet = rows[0];
    if (!wallet) throw new Error("wallet missing");

    if (asDateString(wallet.lastDailyClaimDate) === today) {
      return {
        claimed: false as const,
        reason: "already_claimed" as const,
        streak: wallet.dailyStreak,
        balance: wallet.balance,
        nextReward: rewardForStreakDay(wallet.dailyStreak),
      };
    }

    const newStreak =
      asDateString(wallet.lastDailyClaimDate) === yesterday
        ? wallet.dailyStreak + 1
        : 1;
    const reward = rewardForStreakDay(newStreak);
    const newBalance = wallet.balance + reward;

    await tx
      .update(userWalletsTable)
      .set({
        balance: newBalance,
        dailyStreak: newStreak,
        lastDailyClaimDate: today,
        updatedAt: new Date(),
      })
      .where(eq(userWalletsTable.userId, userId));

    await tx.insert(coinTransactionsTable).values({
      userId,
      amount: reward,
      reason: "daily_login",
      balanceAfter: newBalance,
    });

    return {
      claimed: true as const,
      reward,
      streak: newStreak,
      balance: newBalance,
    };
  });
}
