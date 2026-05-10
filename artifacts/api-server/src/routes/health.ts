import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
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

async function pingDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (err) {
    logger.warn({ err }, "[health] Database ping failed");
    return false;
  }
}

async function healthHandler(_req: Request, res: Response): Promise<void> {
  const redis = getRedisConnection();
  const redisConfigured = redis !== null;

  const [redisConnected, dbConnected] = await Promise.all([
    redis ? pingWithTimeout(redis) : Promise.resolve(false),
    pingDatabase(),
  ]);

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

  // The startup probe only needs to confirm the HTTP server is up.
  // Redis disconnects (e.g. Upstash rate-limit) are degraded, not fatal —
  // returning 503 here would fail the Cloud Run health check and roll back
  // the deployment every time Redis hits its daily request limit.
  const degraded =
    !dbConnected || (redisConfigured && (!redisConnected || !bullmqActive));

  const data = HealthCheckResponse.parse({
    status: degraded ? "degraded" : "ok",
    database: {
      connected: dbConnected,
    },
    redis: {
      connected: redisConnected,
      configured: redisConfigured,
    },
    bullmq: {
      active: bullmqActive,
      workers,
    },
  });

  res.status(200).json(data);
}

router.get("/health", healthHandler);
router.get("/healthz", healthHandler);

export default router;
