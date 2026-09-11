-- Core matchup / votes / suggestions / rooms
-- Apply: psql "$DATABASE_URL" -f lib/db/migrations/0000_core.sql
-- or: API startup ensureSchema()

CREATE TABLE IF NOT EXISTS "matchups" (
  "id" text PRIMARY KEY NOT NULL,
  "left_team" text NOT NULL,
  "right_team" text NOT NULL,
  "left_color" text NOT NULL,
  "right_color" text NOT NULL,
  "emoji" text NOT NULL,
  "left_wins" integer DEFAULT 0 NOT NULL,
  "right_wins" integer DEFAULT 0 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "source" text DEFAULT 'user' NOT NULL,
  "win_threshold" integer DEFAULT 100 NOT NULL,
  "promoted_from_suggestion_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "matchups" ADD COLUMN IF NOT EXISTS "left_wins" integer DEFAULT 0 NOT NULL;
ALTER TABLE "matchups" ADD COLUMN IF NOT EXISTS "right_wins" integer DEFAULT 0 NOT NULL;
ALTER TABLE "matchups" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
ALTER TABLE "matchups" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "matchups" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'user' NOT NULL;
ALTER TABLE "matchups" ADD COLUMN IF NOT EXISTS "win_threshold" integer DEFAULT 100 NOT NULL;
ALTER TABLE "matchups" ADD COLUMN IF NOT EXISTS "promoted_from_suggestion_id" integer;
ALTER TABLE "matchups" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "matchup_votes" (
  "id" serial PRIMARY KEY NOT NULL,
  "matchup_id" text NOT NULL,
  "vote_date" date NOT NULL,
  "offset" integer DEFAULT 0 NOT NULL,
  "left_pulls" integer DEFAULT 0 NOT NULL,
  "right_pulls" integer DEFAULT 0 NOT NULL,
  "week_winner" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "matchup_votes_unique_idx"
  ON "matchup_votes" ("matchup_id", "vote_date");

CREATE TABLE IF NOT EXISTS "vote_rate_limits" (
  "id" serial PRIMARY KEY NOT NULL,
  "ip_hash" text NOT NULL,
  "matchup_id" text NOT NULL,
  "last_vote_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "vote_rate_limits_lookup_idx"
  ON "vote_rate_limits" ("ip_hash", "matchup_id");

CREATE TABLE IF NOT EXISTS "matchup_suggestions" (
  "id" serial PRIMARY KEY NOT NULL,
  "left_team" text NOT NULL,
  "right_team" text NOT NULL,
  "source" text DEFAULT 'user' NOT NULL,
  "promoted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "suggestion_votes" (
  "id" serial PRIMARY KEY NOT NULL,
  "suggestion_id" integer NOT NULL REFERENCES "matchup_suggestions"("id") ON DELETE CASCADE,
  "ip_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "suggestion_votes_unique_idx"
  ON "suggestion_votes" ("suggestion_id", "ip_hash");

CREATE TABLE IF NOT EXISTS "weekly_processing" (
  "id" serial PRIMARY KEY NOT NULL,
  "last_processed_week" date NOT NULL
);

CREATE TABLE IF NOT EXISTS "game_rooms" (
  "id" text PRIMARY KEY NOT NULL,
  "matchup_id" text NOT NULL,
  "left_player_name" text DEFAULT 'Oyuncu' NOT NULL,
  "right_player_name" text,
  "left_player_token" text NOT NULL,
  "right_player_token" text,
  "status" text DEFAULT 'waiting' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "offset" integer DEFAULT 0 NOT NULL,
  "left_pulls" integer DEFAULT 0 NOT NULL,
  "right_pulls" integer DEFAULT 0 NOT NULL,
  "winner" text,
  "countdown_started_at" timestamp with time zone,
  "is_private" boolean DEFAULT false NOT NULL,
  "host_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "game_rooms" ADD COLUMN IF NOT EXISTS "is_private" boolean DEFAULT false NOT NULL;
ALTER TABLE "game_rooms" ADD COLUMN IF NOT EXISTS "host_user_id" text;

CREATE TABLE IF NOT EXISTS "weekly_results" (
  "id" serial PRIMARY KEY NOT NULL,
  "matchup_id" text NOT NULL,
  "week_start_date" date NOT NULL,
  "left_team" text NOT NULL,
  "right_team" text NOT NULL,
  "left_pulls" integer DEFAULT 0 NOT NULL,
  "right_pulls" integer DEFAULT 0 NOT NULL,
  "total_pulls" integer DEFAULT 0 NOT NULL,
  "offset" integer DEFAULT 0 NOT NULL,
  "winner_side" text,
  "left_wins" integer DEFAULT 0 NOT NULL,
  "right_wins" integer DEFAULT 0 NOT NULL,
  "finalized_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "daily_ad_rewards" (
  "id" serial PRIMARY KEY NOT NULL,
  "ip_hash" text NOT NULL,
  "reward_date" date NOT NULL,
  "count" integer DEFAULT 0 NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_ad_rewards_unique_idx"
  ON "daily_ad_rewards" ("ip_hash", "reward_date");
