-- Online weekly point battle + challenge hub foundations
-- Safe / idempotent. Prefer ensureSchema on boot; this file documents incremental DDL.

-- Weekly accumulated points per matchup (source of truth for Online battle)
CREATE TABLE IF NOT EXISTS "matchup_weekly_scores" (
  "id" serial PRIMARY KEY NOT NULL,
  "matchup_id" text NOT NULL REFERENCES "matchups"("id") ON DELETE CASCADE,
  "week_start_date" date NOT NULL,
  "left_points" bigint DEFAULT 0 NOT NULL,
  "right_points" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "matchup_weekly_scores_unique_idx"
  ON "matchup_weekly_scores" ("matchup_id", "week_start_date");

CREATE INDEX IF NOT EXISTS "matchup_weekly_scores_week_idx"
  ON "matchup_weekly_scores" ("week_start_date");

-- Guard against negative points (application also enforces this)
DO $$ BEGIN
  ALTER TABLE "matchup_weekly_scores"
    ADD CONSTRAINT "matchup_weekly_scores_left_nonneg"
    CHECK ("left_points" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "matchup_weekly_scores"
    ADD CONSTRAINT "matchup_weekly_scores_right_nonneg"
    CHECK ("right_points" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Per-user challenge cooldown / play-count (userId-based, not IP)
CREATE TABLE IF NOT EXISTS "online_challenge_user_state" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "matchup_id" text NOT NULL REFERENCES "matchups"("id") ON DELETE CASCADE,
  "challenge_type" text NOT NULL,
  "last_played_at" timestamp with time zone,
  "play_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "online_challenge_user_state_unique_idx"
  ON "online_challenge_user_state" ("user_id", "matchup_id", "challenge_type");

-- Global daily x2 usage across all Online challenges (max 10 / UTC day / user)
CREATE TABLE IF NOT EXISTS "online_daily_x2_usage" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reward_date" date NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "online_daily_x2_usage_unique_idx"
  ON "online_daily_x2_usage" ("user_id", "reward_date");

-- Adapt weekly_results for point-based archive (legacy pull/offset columns retained)
ALTER TABLE "weekly_results" ADD COLUMN IF NOT EXISTS "left_points" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "weekly_results" ADD COLUMN IF NOT EXISTS "right_points" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "weekly_results" ADD COLUMN IF NOT EXISTS "total_points" bigint DEFAULT 0 NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "weekly_results_matchup_week_idx"
  ON "weekly_results" ("matchup_id", "week_start_date");
