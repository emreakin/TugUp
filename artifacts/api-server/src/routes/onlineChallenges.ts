import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { reqT } from "../lib/i18n";
import { isOnlineChallengeType } from "../lib/onlineChallenges";
import {
  claimChallengeX2,
  completeChallenge,
  getChallengeStatusesForUser,
  startChallenge,
} from "../lib/challengePlay";

const router: IRouter = Router();

function mapError(req: AuthedRequest, err: unknown): { status: number; body: Record<string, unknown> } {
  const code = err instanceof Error ? err.message : "server_error";
  switch (code) {
    case "matchup_not_found":
      return { status: 404, body: { error: reqT(req, "invalidMatchupId"), code } };
    case "matchup_inactive":
      return { status: 400, body: { error: reqT(req, "invalidRequest"), code } };
    case "cooldown_active": {
      const e = err as Error & { secondsRemaining?: number; cooldownEndsAt?: string | null };
      return {
        status: 429,
        body: {
          error: reqT(req, "invalidRequest"),
          code,
          secondsRemaining: e.secondsRemaining ?? 0,
          cooldownEndsAt: e.cooldownEndsAt ?? null,
        },
      };
    }
    case "challenge_not_implemented":
      return { status: 501, body: { error: reqT(req, "serverError"), code } };
    case "invalid_play_token":
    case "play_token_expired":
    case "challenge_too_fast":
    case "challenge_too_slow":
    case "tap_count_invalid":
    case "invalid_x2_token":
    case "x2_token_expired":
      return { status: 400, body: { error: reqT(req, "invalidRequest"), code } };
    case "x2_daily_limit":
      return { status: 429, body: { error: reqT(req, "dailyAdLimitReached"), code } };
    case "x2_already_claimed":
      return { status: 409, body: { error: reqT(req, "invalidRequest"), code } };
    default:
      console.error("online challenge error", err);
      return { status: 500, body: { error: reqT(req, "serverError"), code: "server_error" } };
  }
}

/** GET /api/online/challenges/:matchupId/status */
router.get("/:matchupId/status", requireAuth, async (req: AuthedRequest, res) => {
  const matchupId = String(req.params.matchupId ?? "").trim();
  if (!matchupId || !req.userId) {
    res.status(400).json({ error: reqT(req, "invalidRequest") });
    return;
  }
  try {
    const challenges = await getChallengeStatusesForUser(req.userId, matchupId);
    res.json({ matchupId, challenges });
  } catch (err) {
    const mapped = mapError(req, err);
    res.status(mapped.status).json(mapped.body);
  }
});

/** POST /api/online/challenges/start */
router.post("/start", requireAuth, async (req: AuthedRequest, res) => {
  const matchupId = String(req.body?.matchupId ?? "").trim();
  const side = req.body?.side === "right" ? "right" : req.body?.side === "left" ? "left" : null;
  const challengeType = String(req.body?.challengeType ?? "");
  if (!req.userId || !matchupId || !side || !isOnlineChallengeType(challengeType)) {
    res.status(400).json({ error: reqT(req, "invalidRequest") });
    return;
  }
  try {
    const started = await startChallenge({
      userId: req.userId,
      matchupId,
      side,
      challengeType,
    });
    res.json(started);
  } catch (err) {
    const mapped = mapError(req, err);
    res.status(mapped.status).json(mapped.body);
  }
});

/** POST /api/online/challenges/complete */
router.post("/complete", requireAuth, async (req: AuthedRequest, res) => {
  const playToken = String(req.body?.playToken ?? "");
  const tapCount = Number(req.body?.tapCount);
  if (!req.userId || !playToken || !Number.isFinite(tapCount)) {
    res.status(400).json({ error: reqT(req, "invalidRequest") });
    return;
  }
  try {
    const result = await completeChallenge({
      userId: req.userId,
      playToken,
      tapCount,
    });
    res.json(result);
  } catch (err) {
    const mapped = mapError(req, err);
    res.status(mapped.status).json(mapped.body);
  }
});

/** POST /api/online/challenges/claim-x2 — after rewarded ad */
router.post("/claim-x2", requireAuth, async (req: AuthedRequest, res) => {
  const x2ClaimToken = String(req.body?.x2ClaimToken ?? "");
  if (!req.userId || !x2ClaimToken) {
    res.status(400).json({ error: reqT(req, "invalidRequest") });
    return;
  }
  try {
    const result = await claimChallengeX2({
      userId: req.userId,
      x2ClaimToken,
    });
    res.json(result);
  } catch (err) {
    const mapped = mapError(req, err);
    res.status(mapped.status).json(mapped.body);
  }
});

export default router;
