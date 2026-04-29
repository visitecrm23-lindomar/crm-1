import { Worker } from "bullmq";
import { db, reservationsTable, tripsTable, clientsTable, tenantsTable } from "@workspace/db";
import { eq, and, gt, sql, gte, lt } from "drizzle-orm";
import { sendReminderHtmlEmail } from "@workspace/email";
import { getRedisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import type { ReminderJobData } from "../queues/index";

// ────────────────────────────────────────────────────────────
// D-1 Boarding reminder
// ────────────────────────────────────────────────────────────

async function processBoardingReminders(): Promise<void> {
  const now = new Date();
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const rows = await db
    .select({
      reservationId: reservationsTable.id,
      reservationNumber: reservationsTable.reservationNumber,
      voucherCode: reservationsTable.voucherCode,
      seats: reservationsTable.seats,
      tenantId: reservationsTable.tenantId,
      clientId: reservationsTable.clientId,
      tripId: reservationsTable.tripId,
      tripName: tripsTable.name,
      tripDestination: tripsTable.destination,
      departureDate: tripsTable.departureDate,
      boardingPoints: tripsTable.boardingPoints,
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      agencyName: tenantsTable.name,
    })
    .from(reservationsTable)
    .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
    .innerJoin(clientsTable, eq(reservationsTable.clientId, clientsTable.id))
    .innerJoin(tenantsTable, eq(reservationsTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(reservationsTable.status, "confirmed"),
        gte(tripsTable.departureDate, tomorrowStart),
        lt(tripsTable.departureDate, tomorrowEnd),
      ),
    );

  logger.info({ count: rows.length }, "[reminder:boarding] Found reservations for D-1 reminder");

  for (const row of rows) {
    if (!row.clientEmail) continue;

    const depDate = row.departureDate
      ? (row.departureDate as unknown as Date).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "Amanhã";

    const points = (row.boardingPoints ?? []) as { name: string; time?: string; address?: string }[];
    const boardingHtml =
      points.length > 0
        ? points
            .map(
              (p) =>
                `<li><strong>${p.name}</strong>${p.time ? ` — ${p.time}` : ""}${p.address ? `<br><small>${p.address}</small>` : ""}</li>`,
            )
            .join("")
        : "<li>Consulte a agência para informações de embarque</li>";

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#2563EB">🚌 Lembrete de Embarque — Amanhã!</h2>
  <p>Olá, <strong>${row.clientName}</strong>!</p>
  <p>Sua viagem para <strong>${row.tripDestination ?? row.tripName}</strong> está marcada para <strong>amanhã, ${depDate}</strong>.</p>
  <h3 style="color:#374151">Pontos de Embarque:</h3>
  <ul style="line-height:1.8">${boardingHtml}</ul>
  <p>Não esqueça de levar seu documento de identidade e o voucher de reserva.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
  <p style="font-size:13px;color:#6b7280">
    <strong>${row.agencyName}</strong><br>
    Reserva Nº ${row.reservationNumber ?? row.voucherCode}
  </p>
</body>
</html>`;

    const boardingResult = await sendReminderHtmlEmail({
      to: row.clientEmail,
      subject: `🚌 Lembrete: Sua viagem para ${row.tripDestination ?? row.tripName} é amanhã!`,
      html,
      fromName: row.agencyName,
    });
    if (boardingResult.success) {
      logger.info(
        { reservationId: row.reservationId, email: row.clientEmail },
        "[reminder:boarding] Sent D-1 boarding reminder",
      );
    } else {
      logger.error(
        { error: boardingResult.error, reservationId: row.reservationId },
        "[reminder:boarding] Failed to send D-1 reminder",
      );
    }
  }
}

// ────────────────────────────────────────────────────────────
// D-3 Payment reminder
// ────────────────────────────────────────────────────────────

async function processPaymentReminders(): Promise<void> {
  const now = new Date();
  const d3Start = new Date(now);
  d3Start.setDate(d3Start.getDate() + 3);
  d3Start.setHours(0, 0, 0, 0);

  const d3End = new Date(d3Start);
  d3End.setHours(23, 59, 59, 999);

  const rows = await db
    .select({
      reservationId: reservationsTable.id,
      reservationNumber: reservationsTable.reservationNumber,
      voucherCode: reservationsTable.voucherCode,
      balance: reservationsTable.balance,
      totalValue: reservationsTable.totalValue,
      paidValue: reservationsTable.paidValue,
      tenantId: reservationsTable.tenantId,
      tripName: tripsTable.name,
      tripDestination: tripsTable.destination,
      departureDate: tripsTable.departureDate,
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      agencyName: tenantsTable.name,
      agencyPhone: tenantsTable.whatsapp,
    })
    .from(reservationsTable)
    .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
    .innerJoin(clientsTable, eq(reservationsTable.clientId, clientsTable.id))
    .innerJoin(tenantsTable, eq(reservationsTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(reservationsTable.status, "confirmed"),
        gt(reservationsTable.balance, sql`0`),
        gte(tripsTable.departureDate, d3Start),
        lt(tripsTable.departureDate, d3End),
      ),
    );

  logger.info({ count: rows.length }, "[reminder:payment] Found reservations for D-3 payment reminder");

  for (const row of rows) {
    if (!row.clientEmail) continue;

    const balance = Number(row.balance ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const total = Number(row.totalValue ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const paid = Number(row.paidValue ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const depDate = row.departureDate
      ? (row.departureDate as unknown as Date).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "Em 3 dias";

    const whatsappNum = (row.agencyPhone ?? "").replace(/\D/g, "");
    const contactLink = whatsappNum
      ? `<a href="https://wa.me/${whatsappNum}">WhatsApp</a>`
      : "a agência";

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#DC2626">💰 Saldo Pendente — Viagem em 3 Dias</h2>
  <p>Olá, <strong>${row.clientName}</strong>!</p>
  <p>Sua viagem para <strong>${row.tripDestination ?? row.tripName}</strong> está marcada para <strong>${depDate}</strong> e ainda há saldo pendente na sua reserva.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#f9fafb">
      <td style="padding:10px;border:1px solid #e5e7eb">Total da Reserva</td>
      <td style="padding:10px;border:1px solid #e5e7eb;text-align:right"><strong>${total}</strong></td>
    </tr>
    <tr>
      <td style="padding:10px;border:1px solid #e5e7eb">Valor Pago</td>
      <td style="padding:10px;border:1px solid #e5e7eb;text-align:right;color:#16a34a"><strong>${paid}</strong></td>
    </tr>
    <tr style="background:#fef2f2">
      <td style="padding:10px;border:1px solid #e5e7eb">Saldo Pendente</td>
      <td style="padding:10px;border:1px solid #e5e7eb;text-align:right;color:#dc2626"><strong>${balance}</strong></td>
    </tr>
  </table>
  <p>Entre em contato com ${contactLink} para regularizar o pagamento e garantir sua vaga.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
  <p style="font-size:13px;color:#6b7280">
    <strong>${row.agencyName}</strong><br>
    Reserva Nº ${row.reservationNumber ?? row.voucherCode}
  </p>
</body>
</html>`;

    const paymentResult = await sendReminderHtmlEmail({
      to: row.clientEmail,
      subject: `💰 Saldo pendente: sua viagem para ${row.tripDestination ?? row.tripName} é em 3 dias`,
      html,
      fromName: row.agencyName,
    });
    if (paymentResult.success) {
      logger.info(
        { reservationId: row.reservationId, email: row.clientEmail },
        "[reminder:payment] Sent D-3 payment reminder",
      );
    } else {
      logger.error(
        { error: paymentResult.error, reservationId: row.reservationId },
        "[reminder:payment] Failed to send D-3 reminder",
      );
    }
  }
}

// ────────────────────────────────────────────────────────────
// Worker bootstrap
// ────────────────────────────────────────────────────────────

let _worker: Worker<ReminderJobData> | null = null;

export function startReminderWorker(): Worker<ReminderJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("[reminder-worker] No Redis connection — worker not started");
    return null;
  }

  _worker = new Worker<ReminderJobData>(
    "reminders",
    async (job) => {
      logger.info({ jobId: job.id, type: job.data.type }, "[reminder-worker] Processing job");

      if (job.data.type === "boarding_reminder") {
        await processBoardingReminders();
      } else if (job.data.type === "payment_reminder") {
        await processPaymentReminders();
      } else {
        logger.warn({ type: job.data.type }, "[reminder-worker] Unknown reminder type");
      }
    },
    { connection: conn, concurrency: 1 },
  );

  _worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[reminder-worker] Job failed");
  });

  _worker.on("error", (err) => {
    logger.error({ err }, "[reminder-worker] Worker error");
  });

  logger.info("[reminder-worker] Started");
  return _worker;
}

export async function stopReminderWorker(): Promise<void> {
  if (_worker) {
    await _worker.close().catch(() => {});
    _worker = null;
  }
}
