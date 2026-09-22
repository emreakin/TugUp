/**
 * Shared Online challenge definitions (UI + future gameplay).
 * Keep in sync with artifacts/api-server/src/lib/onlineChallenges.ts
 */

export type OnlineChallengeType = "rapid_pull" | "heavy_pull" | "perfect_pull";

export type OnlineChallengeDefinition = {
  type: OnlineChallengeType;
  /** Seconds of cooldown after a successful play. 0 = none. */
  cooldownSeconds: number;
  rewardTier: "high" | "medium" | "skill";
  supportsDoubleReward: boolean;
  /** Ionicons name */
  icon: "flash" | "fitness" | "locate";
  /** i18n key prefixes under game.challenges.<key> */
  i18nKey: "rapidPull" | "heavyPull" | "perfectPull";
};

/**
 * Dev: false = no cooldowns. Flip to true (with server flag) before launch.
 */
export const ONLINE_COOLDOWNS_ENABLED = false;

export const ONLINE_CHALLENGES: OnlineChallengeDefinition[] = [
  {
    type: "rapid_pull",
    cooldownSeconds: 3600,
    rewardTier: "high",
    supportsDoubleReward: true,
    icon: "flash",
    i18nKey: "rapidPull",
  },
  {
    type: "heavy_pull",
    cooldownSeconds: 600,
    rewardTier: "medium",
    supportsDoubleReward: true,
    icon: "fitness",
    i18nKey: "heavyPull",
  },
  {
    type: "perfect_pull",
    cooldownSeconds: 0,
    rewardTier: "skill",
    supportsDoubleReward: true,
    icon: "locate",
    i18nKey: "perfectPull",
  },
];

/** Placeholder display names (English) — UI should prefer i18n. */
export const CHALLENGE_PLACEHOLDER_NAMES: Record<OnlineChallengeType, string> = {
  rapid_pull: "Rapid Pull",
  heavy_pull: "Heavy Pull",
  perfect_pull: "Perfect Pull",
};
