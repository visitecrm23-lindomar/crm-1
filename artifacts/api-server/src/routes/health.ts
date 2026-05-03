import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getRedisConnection } from "../lib/redis";
import { isEmailWorkerRunning } from "../workers/email.worker";
import { isReminderWorkerRunning } from "../workers/reminder.worker";
import { isPdfWorkerRunning } from "../workers/pdf.worker";
import { isCommissionSyncWorkerRunning } from "../workers/commission-sync.worker";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PING_TIMEOUT_MS = 2000;

async function pingWithTimeout(redis: NonNullable<ReturnType<typeof getRedisConnection>>): Promise<boolean> {
  // Guard: only attempt ping if ioredis considers the connection ready.
  // This avoids hanging indefinitely on a connection configured with
  // maxRetriesPerRequest: null and offline queueing.
  if (redis.status !== "ready") return false;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    redis.ping()
      .then(() => { clearTimeout(timer); resolve(true); })
      .catch(() => { clearTimeout(timer); resolve(false); });
  });
}

async function healthHandler(_req: Request, res: Response): Promise<void> {
  const redis = getRedisConnection();
  const redisConfigured = redis !== null;

  let redisConnected = false;
  if (redis) {
    redisConnected = await pingWithTimeout(redis);
  }

  if (redisConfigured && !redisConnected) {
    logger.warn("[health] Redis is disconnected");
  }

  const workers = {
    email: isEmailWorkerRunning(),
    reminder: isReminderWorkerRunning(),
    pdf: isPdfWorkerRunning(),
    commissionSync: isCommissionSyncWorkerRunning(),
  };

  const bullmqActive = Object.values(workers).every(Boolean);

  // Degraded when Redis is configured but not reachable, or when Redis is
  // reachable but no workers have started (they should start alongside Redis).
  const healthy =
    !redisConfigured ||
    (redisConnected && bullmqActive);

  const data = HealthCheckResponse.parse({
    status: healthy ? "ok" : "degraded",
    redis: {
      connected: redisConnected,
      configured: redisConfigured,
    },
    bullmq: {
      active: bullmqActive,
      workers,
    },
  });

  res.status(healthy ? 200 : 503).json(data);
}

router.get("/health", healthHandler);
router.get("/healthz", healthHandler);

export default router;
