-- Faz 1: Arkadaşlık sistemi (users, friendships, invites)
-- Uygulama: pnpm --filter @workspace/db run push
-- veya: psql $DATABASE_URL -f lib/db/migrations/0001_social.sql

ALTER TABLE "game_rooms" ADD COLUMN IF NOT EXISTS "is_private" boolean DEFAULT false NOT NULL;
ALTER TABLE "game_rooms" ADD COLUMN IF NOT EXISTS "host_user_id" text;

CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "display_name" text DEFAULT 'Oyuncu' NOT NULL,
  "auth_provider" text DEFAULT 'guest' NOT NULL,
  "auth_subject" text,
  "player_token" text NOT NULL,
  "friend_code" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_player_token_idx" ON "users" ("player_token");
CREATE UNIQUE INDEX IF NOT EXISTS "users_friend_code_idx" ON "users" ("friend_code");
CREATE UNIQUE INDEX IF NOT EXISTS "users_auth_provider_subject_idx" ON "users" ("auth_provider", "auth_subject");

CREATE TABLE IF NOT EXISTS "friendships" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_low_id" text NOT NULL,
  "user_high_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "friendships_pair_idx" ON "friendships" ("user_low_id", "user_high_id");

CREATE TABLE IF NOT EXISTS "friend_invites" (
  "id" text PRIMARY KEY NOT NULL,
  "inviter_id" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_by" text,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "game_invites" (
  "id" text PRIMARY KEY NOT NULL,
  "host_user_id" text NOT NULL,
  "room_id" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_by" text,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
