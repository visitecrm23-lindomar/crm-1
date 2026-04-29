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

export interface PdfJobData {
  type: "manifest";
  tenantId: string;
  tripId: string;
  tripName: string;
  manifestNumber: string | null;
  agencyName: string;
  recipientEmail: string;
  htmlContent: string;
  pdfBase64: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const QUEUES = {
  EMAIL: "emails",
  REMINDERS: "reminders",
  PDF: "pdfs",
} as const;

let _emailQueue: Queue<ReservationEmailJobData> | null = null;
let _reminderQueue: Queue<ReminderJobData> | null = null;
let _pdfQueue: Queue<PdfJobData> | null = null;

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

export function getPdfQueue(): Queue<PdfJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  if (!_pdfQueue) {
    _pdfQueue = new Queue<PdfJobData>(QUEUES.PDF, {
      connection: conn,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 15_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _pdfQueue;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([
    _emailQueue?.close().catch(() => {}),
    _reminderQueue?.close().catch(() => {}),
    _pdfQueue?.close().catch(() => {}),
  ]);
  _emailQueue = null;
  _reminderQueue = null;
  _pdfQueue = null;
}
