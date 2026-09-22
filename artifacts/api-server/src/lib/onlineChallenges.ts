/**
 * Online challenge definitions + future x2 / cooldown helpers.
 *
 * Challenge GAMEPLAY is NOT implemented yet. This module centralizes rules so
 * the next iteration can award points / enforce cooldowns / x2 without
 * scattering magic numbers.
 */

export type OnlineChallengeType = "rapid_pull" | "heavy_pull" | "perfect_pull";

export type OnlineChallengeDefinition = {
  type: OnlineChallengeType;
  /** Seconds of cooldown after a successful play. 0 = none. */
  cooldownSeconds: number;
  rewardTier: "high" | "medium" | "skill";
  /** All three support future rewarded-ad x2. */
  supportsDoubleReward: boolean;
};

export const ONLINE_CHALLENGES: Record<OnlineChallengeType, OnlineChallengeDefinition> = {
  rapid_pull: {
    type: "rapid_pull",
    cooldownSeconds: 3600,
    rewardTier: "high",
    supportsDoubleReward: true,
  },
  heavy_pull: {
    type: "heavy_pull",
    cooldownSeconds: 600,
    rewardTier: "medium",
    supportsDoubleReward: true,
  },
  perfect_pull: {
    type: "perfect_pull",
    cooldownSeconds: 0,
    rewardTier: "skill",
    supportsDoubleReward: true,
  },
};

/** Global max x2 rewarded uses across ALL Online challenges per UTC day. */
export const ONLINE_DAILY_X2_MAX = 10;

/**
 * Perfect Pull alternating x2 eligibility.
 * Given current playCount (before awarding a completion), the next attempt
 * index is playCount + 1. Odd attempts (1,3,5…) are eligible.
 */
export function isPerfectPullX2Eligible(playCountBeforeAttempt: number): boolean {
  const nextAttempt = playCountBeforeAttempt + 1;
  return nextAttempt % 2 === 1;
}

export function isOnlineChallengeType(value: string): value is OnlineChallengeType {
  return value === "rapid_pull" || value === "heavy_pull" || value === "perfect_pull";
}

/** Remaining x2 slots for a user today (UTC). Cap is ONLINE_DAILY_X2_MAX total. */
export function remainingDailyX2(usedToday: number): number {
  return Math.max(0, ONLINE_DAILY_X2_MAX - Math.max(0, usedToday));
}
