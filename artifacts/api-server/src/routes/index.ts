import { Router, type IRouter } from "express";
import healthRouter from "./health";
import votesRouter from "./votes";
import suggestionsRouter from "./suggestions";
import matchupsRouter from "./matchups";
import gameRouter from "./game";
import authRouter from "./auth";
import friendsRouter from "./friends";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/friends", friendsRouter);
router.use("/matchups", matchupsRouter);
router.use("/votes", votesRouter);
router.use("/suggestions", suggestionsRouter);
router.use("/game", gameRouter);

export default router;
