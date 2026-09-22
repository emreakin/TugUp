import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  timestamp,
  date,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Active matchup registry with cumulative win counts
export const matchupsTable = pgTable("matchups", {
  id: text("id").primaryKey(),
  leftTeam: text("left_team").notNull(),
  rightTeam: text("right_team").notNull(),
  leftColor: text("left_color").notNull(),
  rightColor: text("right_color").notNull(),
  emoji: text("emoji").notNull(),
  leftWins: integer("left_wins").notNull().default(0),
  rightWins: integer("right_wins").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  source: text("source").notNull().default("user"),
  /** @deprecated Legacy Online threshold model — unused by weekly point battles. Column retained for safe migration. */
  winThreshold: integer("win_threshold").notNull().default(100),
  promotedFromSuggestionId: integer("promoted_from_suggestion_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Matchup = typeof matchupsTable.$inferSelect;

/**
 * Current (and past) weekly accumulated points per matchup.
 * Source of truth for Online battle state. Percentages are derived, not stored.
 *
 * BIGINT via mode:"number": points stay within JS safe integer range for a long
 * time; Express JSON serialization stays trivial (no native BigInt).
 */
export const matchupWeeklyScoresTable = pgTable(
  "matchup_weekly_scores",
  {
    id: serial("id").primaryKey(),
    matchupId: text("matchup_id")
      .notNull()
      .references(() => matchupsTable.id, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date").notNull(),
    leftPoints: bigint("left_points", { mode: "number" }).notNull().default(0),
    rightPoints: bigint("right_points", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("matchup_weekly_scores_unique_idx").on(t.matchupId, t.weekStartDate),
    index("matchup_weekly_scores_week_idx").on(t.weekStartDate),
  ],
);

export type MatchupWeeklyScore = typeof matchupWeeklyScoresTable.$inferSelect;

/** @deprecated Legacy offset/vote Online model — retained; no longer drives gameplay. */
export const matchupVotesTable = pgTable(
  "matchup_votes",
  {
    id: serial("id").primaryKey(),
    matchupId: text("matchup_id").notNull(),
    voteDate: date("vote_date").notNull(),
    offset: integer("offset").notNull().default(0),
    leftPulls: integer("left_pulls").notNull().default(0),
    rightPulls: integer("right_pulls").notNull().default(0),
    // Set to 'left' or 'right' once a winner is determined for this week
    weekWinner: text("week_winner"),
  },
  (t) => [uniqueIndex("matchup_votes_unique_idx").on(t.matchupId, t.voteDate)],
);

export type MatchupVote = typeof matchupVotesTable.$inferSelect;

// IP-based rate limiting — 1 vote per hour per (ipHash, matchupId)
export const voteRateLimitsTable = pgTable(
  "vote_rate_limits",
  {
    id: serial("id").primaryKey(),
    ipHash: text("ip_hash").notNull(),
    matchupId: text("matchup_id").notNull(),
    lastVoteAt: timestamp("last_vote_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("vote_rate_limits_lookup_idx").on(t.ipHash, t.matchupId)],
);

export type VoteRateLimit = typeof voteRateLimitsTable.$inferSelect;

// User-suggested matchups
export const matchupSuggestionsTable = pgTable("matchup_suggestions", {
  id: serial("id").primaryKey(),
  leftTeam: text("left_team").notNull(),
  rightTeam: text("right_team").notNull(),
  source: text("source").notNull().default("user"),
  promotedAt: timestamp("promoted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MatchupSuggestion = typeof matchupSuggestionsTable.$inferSelect;

// Votes on user suggestions — 1 per IP per suggestion
export const suggestionVotesTable = pgTable(
  "suggestion_votes",
  {
    id: serial("id").primaryKey(),
    suggestionId: integer("suggestion_id")
      .notNull()
      .references(() => matchupSuggestionsTable.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("suggestion_votes_unique_idx").on(t.suggestionId, t.ipHash)],
);

export type SuggestionVote = typeof suggestionVotesTable.$inferSelect;

// Tracks the last week for which end-of-week processing was done
export const weeklyProcessingTable = pgTable("weekly_processing", {
  id: serial("id").primaryKey(),
  lastProcessedWeek: date("last_processed_week").notNull(),
});

// ── 1v1 Real-time Game Rooms ─────────────────────────────────────────────
export const gameRoomsTable = pgTable("game_rooms", {
  id: text("id").primaryKey(),
  matchupId: text("matchup_id").notNull(),
  leftPlayerName: text("left_player_name").notNull().default("Oyuncu"),
  rightPlayerName: text("right_player_name"),
  leftPlayerToken: text("left_player_token").notNull(),
  rightPlayerToken: text("right_player_token"),
  status: text("status").notNull().default("waiting"), // waiting | countdown | playing | ended
  active: boolean("active").notNull().default(true),
  offset: integer("offset").notNull().default(0),
  leftPulls: integer("left_pulls").notNull().default(0),
  rightPulls: integer("right_pulls").notNull().default(0),
  winner: text("winner"), // 'left' | 'right'
  countdownStartedAt: timestamp("countdown_started_at", { withTimezone: true }),
  isPrivate: boolean("is_private").notNull().default(false),
  hostUserId: text("host_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GameRoom = typeof gameRoomsTable.$inferSelect;

// ── Users & Social ─────────────────────────────────────────────────────────
export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull().default("Oyuncu"),
    authProvider: text("auth_provider").notNull().default("guest"), // guest | google
    authSubject: text("auth_subject"),
    playerToken: text("player_token").notNull(),
    friendCode: text("friend_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_player_token_idx").on(t.playerToken),
    uniqueIndex("users_friend_code_idx").on(t.friendCode),
    uniqueIndex("users_auth_provider_subject_idx").on(t.authProvider, t.authSubject),
  ],
);

export type User = typeof usersTable.$inferSelect;

/**
 * Per-user Online challenge cooldown / play-count state.
 * userId-based (NOT IP). Placeholder clicks must NOT mutate this table.
 *
 * Perfect Pull future x2 eligibility uses playCount:
 *   attempt N is x2-eligible when (playCount + 1) is odd
 *   → attempts 1,3,5… eligible; 2,4,6… not.
 */
export const onlineChallengeUserStateTable = pgTable(
  "online_challenge_user_state",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    matchupId: text("matchup_id")
      .notNull()
      .references(() => matchupsTable.id, { onDelete: "cascade" }),
    /** rapid_pull | heavy_pull | perfect_pull */
    challengeType: text("challenge_type").notNull(),
    lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
    playCount: integer("play_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("online_challenge_user_state_unique_idx").on(
      t.userId,
      t.matchupId,
      t.challengeType,
    ),
  ],
);

export type OnlineChallengeUserState = typeof onlineChallengeUserStateTable.$inferSelect;

/**
 * Global daily x2 rewarded-ad usage across ALL Online challenges.
 * Cap: 10 per userId per UTC calendar day (not 10 per challenge).
 */
export const onlineDailyX2UsageTable = pgTable(
  "online_daily_x2_usage",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** UTC date YYYY-MM-DD */
    rewardDate: date("reward_date").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("online_daily_x2_usage_unique_idx").on(t.userId, t.rewardDate),
  ],
);

export type OnlineDailyX2Usage = typeof onlineDailyX2UsageTable.$inferSelect;

// Canonical friendship row — userLowId < userHighId lexicographically
export const friendshipsTable = pgTable(
  "friendships",
  {
    id: serial("id").primaryKey(),
    userLowId: text("user_low_id").notNull(),
    userHighId: text("user_high_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("friendships_pair_idx").on(t.userLowId, t.userHighId)],
);

export type Friendship = typeof friendshipsTable.$inferSelect;

// One-time friend invite links (share via WhatsApp etc.)
export const friendInvitesTable = pgTable("friend_invites", {
  id: text("id").primaryKey(),
  inviterId: text("inviter_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedBy: text("used_by"),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FriendInvite = typeof friendInvitesTable.$inferSelect;

// Private 1v1 game invite links
export const gameInvitesTable = pgTable("game_invites", {
  id: text("id").primaryKey(),
  hostUserId: text("host_user_id").notNull(),
  roomId: text("room_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedBy: text("used_by"),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GameInvite = typeof gameInvitesTable.$inferSelect;

// ── Weekly Results Archive ─────────────────────────────────────────────────
// Final snapshot of every matchup after the weekly period ends.
// Point columns are the new source of truth; pull/offset retained for legacy rows.
export const weeklyResultsTable = pgTable(
  "weekly_results",
  {
    id: serial("id").primaryKey(),
    matchupId: text("matchup_id").notNull(),
    weekStartDate: date("week_start_date").notNull(),
    leftTeam: text("left_team").notNull(),
    rightTeam: text("right_team").notNull(),
    /** @deprecated Legacy vote pulls — zero for point-based weeks. */
    leftPulls: integer("left_pulls").notNull().default(0),
    /** @deprecated Legacy vote pulls — zero for point-based weeks. */
    rightPulls: integer("right_pulls").notNull().default(0),
    /** @deprecated Prefer totalPoints. */
    totalPulls: integer("total_pulls").notNull().default(0),
    /** @deprecated Legacy offset model. */
    offset: integer("offset").notNull().default(0),
    leftPoints: bigint("left_points", { mode: "number" }).notNull().default(0),
    rightPoints: bigint("right_points", { mode: "number" }).notNull().default(0),
    totalPoints: bigint("total_points", { mode: "number" }).notNull().default(0),
    winnerSide: text("winner_side"), // 'left' | 'right' | 'draw' | null
    leftWins: integer("left_wins").notNull().default(0),
    rightWins: integer("right_wins").notNull().default(0),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("weekly_results_matchup_week_idx").on(t.matchupId, t.weekStartDate),
  ],
);

export type WeeklyResult = typeof weeklyResultsTable.$inferSelect;

// ── Daily Ad Reward Limits ───────────────────────────────────────────────
// IP-based daily limit: max 3 rewarded ad skips per day
export const dailyAdRewardsTable = pgTable(
  "daily_ad_rewards",
  {
    id: serial("id").primaryKey(),
    ipHash: text("ip_hash").notNull(),
    rewardDate: date("reward_date").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("daily_ad_rewards_unique_idx").on(t.ipHash, t.rewardDate)],
);

export type DailyAdReward = typeof dailyAdRewardsTable.$inferSelect;

// ── Coins & Daily Login ────────────────────────────────────────────────────
/** Per-user coin wallet + consecutive daily-login streak */
export const userWalletsTable = pgTable("user_wallets", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  /** Consecutive daily claims (1 = first day reward, 5+ = max 100 coin) */
  dailyStreak: integer("daily_streak").notNull().default(0),
  /** UTC calendar date (YYYY-MM-DD) of last successful daily claim */
  lastDailyClaimDate: date("last_daily_claim_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserWallet = typeof userWalletsTable.$inferSelect;

/** Append-only ledger for earn/spend (audit + future shop) */
export const coinTransactionsTable = pgTable(
  "coin_transactions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(), // positive = earn, negative = spend
    reason: text("reason").notNull(), // daily_login | purchase | … 
    balanceAfter: integer("balance_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("coin_transactions_user_idx").on(t.userId, t.createdAt)],
);

export type CoinTransaction = typeof coinTransactionsTable.$inferSelect;
