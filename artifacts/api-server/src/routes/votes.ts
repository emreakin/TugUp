/**
 * @deprecated Legacy Online vote / offset / threshold API.
 *
 * The Online mode is now a weekly point battle (`GET /api/matchups/:id/state`).
 * These routes remain mounted only so old clients receive a clear 410 instead of
 * silent 404s. Do not add new callers. Do not restore offset gameplay here.
 *
 * Removed from active product flow:
 * - POST vote (±1 offset)
 * - IP-based 1h cooldown
 * - Rewarded-ad cooldown skip (max 3/day)
 * - winThreshold / offset as Online truth
 *
 * Tables retained safely: matchup_votes, vote_rate_limits, daily_ad_rewards.
 */
import { Router, type IRouter } from "express";
import { reqT } from "../lib/i18n";

const router: IRouter = Router();

const GONE = {
  error: "legacy_online_votes_removed",
  message:
    "The vote/offset Online model has been replaced by weekly point battles. Use GET /api/matchups/:matchupId/state.",
};

router.get("/:matchupId/reward-limit", (req, res) => {
  res.status(410).json({ ...GONE, hint: reqT(req, "serverError") });
});

router.post("/:matchupId/reward", (req, res) => {
  res.status(410).json(GONE);
});

router.get("/:matchupId", (req, res) => {
  res.status(410).json(GONE);
});

router.post("/:matchupId", (req, res) => {
  res.status(410).json(GONE);
});

export default router;
