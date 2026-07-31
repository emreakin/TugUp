-- Coin wallet + transaction ledger + daily login streak
-- Uygulama: pnpm --filter @workspace/db run push
-- veya: psql $DATABASE_URL -f lib/db/migrations/0002_coins.sql

CREATE TABLE IF NOT EXISTS "user_wallets" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "balance" integer DEFAULT 0 NOT NULL,
  "daily_streak" integer DEFAULT 0 NOT NULL,
  "last_daily_claim_date" date,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "coin_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "amount" integer NOT NULL,
  "reason" text NOT NULL,
  "balance_after" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "coin_transactions_user_idx"
  ON "coin_transactions" ("user_id", "created_at");
