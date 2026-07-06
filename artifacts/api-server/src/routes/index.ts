import { Router, type IRouter } from "express";
import healthRouter from "./health";
import votesRouter from "./votes";
import suggestionsRouter from "./suggestions";
import matchupsRouter from "./matchups";
import gameRouter from "./game";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/matchups", matchupsRouter);
router.use("/votes", votesRouter);
router.use("/suggestions", suggestionsRouter);
router.use("/game", gameRouter);

export default router;
