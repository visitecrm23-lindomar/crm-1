import { Queue } from "bullmq";
import { getRedisConnection } from "../lib/redis";
import type { ReservationConfirmationEmailProps } from "@workspace/email";

export interface ReservationEmailJobData extends ReservationConfirmationEmailProps {
  emailLogId: string;
  tenantId: string;
  reservationId?: string;
}

export interface ReminderJobData {
  type: "boarding_reminder" | "payment_reminder";
}

const QUEUES = {
  EMAIL: "emails",
  REMINDERS: "reminders",
} as const;

let _emailQueue: Queue<ReservationEmailJobData> | null = null;
let _reminderQueue: Queue<ReminderJobData> | null = null;

export function getEmailQueue(): Queue<ReservationEmailJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  if (!_emailQueue) {
    _emailQueue = new Queue<ReservationEmailJobData>(QUEUES.EMAIL, {
      connection: conn,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return _emailQueue;
}

export function getReminderQueue(): Queue<ReminderJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  if (!_reminderQueue) {
    _reminderQueue = new Queue<ReminderJobData>(QUEUES.REMINDERS, {
      connection: conn,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _reminderQueue;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([
    _emailQueue?.close().catch(() => {}),
    _reminderQueue?.close().catch(() => {}),
  ]);
  _emailQueue = null;
  _reminderQueue = null;
}
