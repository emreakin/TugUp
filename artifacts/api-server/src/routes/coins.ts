import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import {
  claimDailyLogin,
  getOrCreateWallet,
  walletStatus,
} from "../lib/coins";
import { logger } from "../lib/logger";
import { reqT } from "../lib/i18n";

const router = Router();

// GET /api/coins — current balance + daily claim status
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const wallet = await getOrCreateWallet(req.userId!);
    return res.json(walletStatus(wallet));
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

export default router;
