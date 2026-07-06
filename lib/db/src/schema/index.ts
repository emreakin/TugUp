import { pgTable, serial, text, integer, timestamp, date, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";

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
  winThreshold: integer("win_threshold").notNull().default(100),
  promotedFromSuggestionId: integer("promoted_from_suggestion_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Matchup = typeof matchupsTable.$inferSelect;

// Weekly vote state per matchup
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GameRoom = typeof gameRoomsTable.$inferSelect;

// ── Weekly Results Archive ─────────────────────────────────────────────────
// Final snapshot of every matchup after the weekly voting period ends.
export const weeklyResultsTable = pgTable("weekly_results", {
  id: serial("id").primaryKey(),
  matchupId: text("matchup_id").notNull(),
  weekStartDate: date("week_start_date").notNull(),
  leftTeam: text("left_team").notNull(),
  rightTeam: text("right_team").notNull(),
  leftPulls: integer("left_pulls").notNull().default(0),
  rightPulls: integer("right_pulls").notNull().default(0),
  totalPulls: integer("total_pulls").notNull().default(0),
  offset: integer("offset").notNull().default(0),
  winnerSide: text("winner_side"), // 'left' | 'right' | null
  leftWins: integer("left_wins").notNull().default(0),
  rightWins: integer("right_wins").notNull().default(0),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull().defaultNow(),
});

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
