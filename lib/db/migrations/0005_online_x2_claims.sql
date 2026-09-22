-- One-time x2 claim nonces (prevents replaying claim tokens)
CREATE TABLE IF NOT EXISTS "online_x2_claims" (
  "nonce" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
