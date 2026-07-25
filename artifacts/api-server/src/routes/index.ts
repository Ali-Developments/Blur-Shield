import { Router, type IRouter } from "express";
import healthRouter from "./health";
import youtubeRouter from "./youtube";
import aiRouter from "./ai";
import browseRouter from "./browse";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/audio", youtubeRouter);
router.use("/ai", aiRouter);
router.use("/browse", browseRouter);

export default router;
