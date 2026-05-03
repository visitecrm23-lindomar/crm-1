import { Worker } from "bullmq";
import { getRedisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import { syncReservationCommission } from "../routes/payments";
import { markCommissionSyncFailed, clearCommissionSyncStatus } from "../queues/commission-sync-helper";
import type { CommissionSyncJobData } from "../queues/index";

let _worker: Worker<CommissionSyncJobData> | null = null;

export function startCommissionSyncWorker(): Worker<CommissionSyncJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("[commission-sync-worker] No Redis connection — worker not started");
    return null;
  }

  _worker = new Worker<CommissionSyncJobData>(
    "commission-sync",
    async (job) => {
      const { reservationId, tenantId } = job.data;
      logger.info({ jobId: job.id, reservationId, tenantId }, "[commission-sync-worker] Processing job");
      await syncReservationCommission(reservationId, tenantId);
      await clearCommissionSyncStatus(reservationId, tenantId);
      logger.info({ jobId: job.id, reservationId }, "[commission-sync-worker] Commission sync complete");
    },
    {
      connection: conn,
      concurrency: 3,
    },
  );

  _worker.on("failed", (job, err) => {
    const maxAttempts = job?.opts?.attempts ?? 3;
    const isFinal = (job?.attemptsMade ?? 0) >= maxAttempts;
    logger.error(
      { jobId: job?.id, reservationId: job?.data?.reservationId, attemptsMade: job?.attemptsMade, isFinal, err },
      "[commission-sync-worker] Job failed",
    );
    if (isFinal && job?.data?.reservationId && job?.data?.tenantId) {
      markCommissionSyncFailed(job.data.reservationId, job.data.tenantId).catch((e) => {
        logger.error({ reservationId: job.data.reservationId, err: e }, "[commission-sync-worker] Failed to mark commissionSyncStatus");
      });
    }
  });

  _worker.on("error", (err) => {
    logger.error({ err }, "[commission-sync-worker] Worker error");
  });

  logger.info("[commission-sync-worker] Started");
  return _worker;
}

export async function stopCommissionSyncWorker(): Promise<void> {
  if (_worker) {
    await _worker.close().catch(() => {});
    _worker = null;
  }
}

export function isCommissionSyncWorkerRunning(): boolean {
  return _worker !== null;
}
