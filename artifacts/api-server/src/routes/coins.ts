import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import {
  claimDailyLogin,
  debitCoins,
  getOrCreateWallet,
  InsufficientCoinsError,
  JOKER_COIN_COST,
  walletStatus,
} from "../lib/coins";
import { logger } from "../lib/logger";
import { reqT } from "../lib/i18n";

const router = Router();

// GET /api/coins — current balance + daily claim status
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const wallet = await getOrCreateWallet(req.userId!);
    return res.json({
      ...walletStatus(wallet),
      jokerCost: JOKER_COIN_COST,
    });
  } catch (err) {
    logger.error({ err }, "Get coins error");
    return res.status(500).json({ error: reqT(req, "serverError") });
  }
});

// POST /api/coins/daily-claim — claim consecutive daily login reward
router.post("/daily-claim", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const result = await claimDailyLogin(req.userId!);
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "Daily claim error");
    return res.status(500).json({ error: reqT(req, "serverError") });
  }
});

// POST /api/coins/purchase-joker — spend coins for one Quick Game joker unlock
router.post("/purchase-joker", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { balance } = await debitCoins(
      req.userId!,
      JOKER_COIN_COST,
      "joker_purchase",
    );
    return res.json({
      ok: true,
      cost: JOKER_COIN_COST,
      balance,
    });
  } catch (err) {
    if (err instanceof InsufficientCoinsError) {
      return res.status(400).json({ error: reqT(req, "insufficientCoins") });
    }
    logger.error({ err }, "Purchase joker error");
    return res.status(500).json({ error: reqT(req, "serverError") });
  }
});

export default router;
