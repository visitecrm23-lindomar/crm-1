import { Router, type NextFunction } from "express";
import { requireAuth } from "../lib/tenant";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { getRedisStatus, fetchUpstashDailyStats, areWorkersEnabled } from "../lib/redis";
import { ROLES } from "@workspace/permissions";

const router = Router();

router.get("/admin/system-health", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.SUPER_ADMIN) {
      next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return;
    }

    const redisStatus = getRedisStatus();
    const dailyStats = await fetchUpstashDailyStats();

    res.json({
      redis: {
        status: redisStatus,
        ...(dailyStats !== null
          ? {
              dailyUsage: {
                commandCount: dailyStats.commandCount,
                maxCommands: dailyStats.maxCommands,
                usagePct: Math.round(dailyStats.usagePct * 10) / 10,
                warningThresholdPct: dailyStats.warningThresholdPct,
              },
            }
          : {}),
      },
      workers: {
        enabled: areWorkersEnabled(),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
