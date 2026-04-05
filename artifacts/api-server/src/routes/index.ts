import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import clientsRouter from "./clients";
import tripsRouter from "./trips";
import reservationsRouter from "./reservations";
import paymentsRouter from "./payments";
import pipelineRouter from "./pipeline";
import communicationRouter from "./communication";
import registrationsRouter from "./registrations";
import marketingRouter from "./marketing";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(usersRouter);
router.use(clientsRouter);
router.use(tripsRouter);
router.use(reservationsRouter);
router.use(paymentsRouter);
router.use(pipelineRouter);
router.use(communicationRouter);
router.use(registrationsRouter);
router.use(marketingRouter);

export default router;
