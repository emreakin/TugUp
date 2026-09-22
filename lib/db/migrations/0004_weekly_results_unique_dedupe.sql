-- 0004: Dedupe legacy weekly_results rows, then add unique (matchup, week) index.
-- Needed because 0003's unique index failed on DBs that already had duplicates
-- from older weekly processing (e.g. matchup_id=x-y, week_start_date=2026-08-03).

-- Keep the newest row per (matchup_id, week_start_date); drop the rest.
DELETE FROM "weekly_results" wr
WHERE wr.id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY matchup_id, week_start_date
        ORDER BY finalized_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM "weekly_results"
  ) ranked
  WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "weekly_results_matchup_week_idx"
  ON "weekly_results" ("matchup_id", "week_start_date");
