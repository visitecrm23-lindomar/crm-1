import { Router, type Request, type NextFunction } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { storeOrdersTable, reservationsTable, paymentsTable, storesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";
import { syncReservationPaymentStatus, paymentExistsForGatewayTx } from "../lib/reservation-payments";

const router = Router();

// Express captures the parsed body via req.body and the raw bytes via
// req.rawBody (see app.ts express.json verify hook). Webhook signature
// checks must use rawBody to avoid normalization differences.
type RawBodyRequest = Request & { rawBody?: Buffer };

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe webhook
// ─────────────────────────────────────────────────────────────────────────────

interface StripeSignatureParts {
  timestamp: string;
  v1: string[];
}

function parseStripeSignature(header: string | undefined): StripeSignatureParts | null {
  if (!header) return null;
  let timestamp = "";
  const v1: string[] = [];
  for (const piece of header.split(",")) {
    const [k, v] = piece.split("=");
    if (!k || !v) continue;
    if (k.trim() === "t") timestamp = v.trim();
    else if (k.trim() === "v1") v1.push(v.trim());
  }
  if (!timestamp || v1.length === 0) return null;
  return { timestamp, v1 };
}

const STRIPE_TOLERANCE_SECONDS = 300; // 5 minutes — matches Stripe SDK default

function verifyStripeSignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  const parsed = parseStripeSignature(header);
  if (!parsed) return false;
  const tsNum = Number(parsed.timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > STRIPE_TOLERANCE_SECONDS) return false;
  const signedPayload = `${parsed.timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  return parsed.v1.some((sig) => timingSafeEqualHex(expected, sig));
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

router.post("/webhooks/store/stripe", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const secret = process.env["STRIPE_WEBHOOK_SECRET"];
    if (!secret) {
      logger.warn("[webhooks/store/stripe] STRIPE_WEBHOOK_SECRET not configured — rejecting");
      res.status(503).json({ error: "Webhook not configured" });
      return;
    }

    const rawBody = (req as RawBodyRequest).rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "Missing raw body" });
      return;
    }

    const sigHeader = req.header("stripe-signature");
    if (!verifyStripeSignature(rawBody, sigHeader, secret)) {
      logger.warn({ sigHeader: sigHeader ? "present" : "missing" }, "[webhooks/store/stripe] Invalid signature");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    const event = req.body as StripeEvent;
    if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
      res.status(400).json({ error: "Malformed event" });
      return;
    }

    // Acknowledge receipt fast; processing errors are logged but the event is
    // still acked (Stripe will not retry on 2xx). For unhandled types we just
    // return 200 with no work.
    await handleStripeEvent(event).catch((err) => {
      logger.error({ err, eventId: event.id, eventType: event.type }, "[webhooks/store/stripe] Processing error");
    });

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});

async function handleStripeEvent(event: StripeEvent): Promise<void> {
  const obj = event.data?.object ?? {};

  if (event.type === "payment_intent.succeeded") {
    const paymentIntentId = String(obj["id"] ?? "");
    const amountReceived = Number(obj["amount_received"] ?? obj["amount"] ?? 0) / 100;
    if (!paymentIntentId || amountReceived <= 0) return;
    await applyGatewayPayment({
      gateway: "stripe",
      transactionId: paymentIntentId,
      paymentIntentId,
      amount: amountReceived,
      status: "paid",
      paidAt: new Date(),
    });
    return;
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntentId = String(obj["id"] ?? "");
    if (!paymentIntentId) return;
    await markOrderFailed(paymentIntentId, "stripe");
    return;
  }

  if (event.type === "charge.refunded") {
    const paymentIntentId = String(obj["payment_intent"] ?? "");
    if (!paymentIntentId) return;
    await markOrderRefunded(paymentIntentId, "stripe");
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MercadoPago webhook
// ─────────────────────────────────────────────────────────────────────────────
//
// MP signs notifications with HMAC-SHA256 over a manifest of the form:
//   `id:<dataId>;request-id:<x-request-id>;ts:<ts>;`
// using the per-application secret. The signature arrives in the
// `x-signature` header (`ts=<ts>,v1=<hex>`) with `x-request-id` in another
// header. The webhook payload itself is intentionally minimal — we must
// fetch the actual payment from MP's REST API using the per-store access
// token to learn its status and amount.

interface MpSignatureParts {
  ts: string;
  v1: string;
}

function parseMpSignature(header: string | undefined): MpSignatureParts | null {
  if (!header) return null;
  let ts = "";
  let v1 = "";
  for (const piece of header.split(",")) {
    const [k, v] = piece.split("=");
    if (!k || !v) continue;
    if (k.trim() === "ts") ts = v.trim();
    else if (k.trim() === "v1") v1 = v.trim();
  }
  if (!ts || !v1) return null;
  return { ts, v1 };
}

const MP_TOLERANCE_SECONDS = 600; // 10 minutes — MP delivery can be slower than Stripe

function verifyMpSignature(
  dataId: string,
  xRequestId: string,
  header: string | undefined,
  secret: string,
): boolean {
  const parsed = parseMpSignature(header);
  if (!parsed) return false;
  // Reject signatures whose timestamp is too far from now to limit replay
  // windows. MP signs `ts` in milliseconds (per their docs), but some
  // examples use seconds — accept either by normalising.
  const tsRaw = Number(parsed.ts);
  if (!Number.isFinite(tsRaw)) return false;
  const tsSec = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsSec) > MP_TOLERANCE_SECONDS) return false;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${parsed.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return timingSafeEqualHex(expected, parsed.v1);
}

interface MpPayment {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  external_reference?: string | null;
  date_approved?: string | null;
}

async function fetchMpPayment(paymentId: string, accessToken: string): Promise<MpPayment | null> {
  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status, paymentId }, "[webhooks/mercadopago] Failed to fetch payment");
      return null;
    }
    return (await resp.json()) as MpPayment;
  } catch (err) {
    logger.error({ err, paymentId }, "[webhooks/mercadopago] Error fetching payment");
    return null;
  }
}

router.post("/webhooks/store/mercadopago", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const secret = process.env["MP_WEBHOOK_SECRET"];
    if (!secret) {
      logger.warn("[webhooks/store/mercadopago] MP_WEBHOOK_SECRET not configured — rejecting");
      res.status(503).json({ error: "Webhook not configured" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const queryDataId = typeof req.query["data.id"] === "string" ? (req.query["data.id"] as string) : "";
    const bodyData = (body["data"] ?? {}) as Record<string, unknown>;
    const dataId = String(bodyData["id"] ?? queryDataId ?? "");
    const eventType = String(body["type"] ?? body["topic"] ?? req.query["type"] ?? req.query["topic"] ?? "");

    if (!dataId) {
      res.status(400).json({ error: "Missing data.id" });
      return;
    }

    const xRequestId = req.header("x-request-id") ?? "";
    const sigHeader = req.header("x-signature");
    if (!verifyMpSignature(dataId, xRequestId, sigHeader, secret)) {
      logger.warn({ sigHeader: sigHeader ? "present" : "missing" }, "[webhooks/mercadopago] Invalid signature");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    if (eventType !== "payment") {
      // Ack other notification types (merchant_order, etc.) without processing.
      res.status(200).json({ received: true });
      return;
    }

    handleMpPayment(dataId).catch((err) => {
      logger.error({ err, dataId }, "[webhooks/mercadopago] Processing error");
    });

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});

async function handleMpPayment(paymentId: string): Promise<void> {
  // Find the order this MP payment refers to so we can use the right store's
  // access token to fetch the payment details.
  const [order] = await db
    .select({
      id: storeOrdersTable.id,
      storeId: storeOrdersTable.storeId,
      tenantId: storeOrdersTable.tenantId,
    })
    .from(storeOrdersTable)
    .where(eq(storeOrdersTable.paymentIntentId, paymentId))
    .limit(1);

  if (!order) {
    logger.info({ paymentId }, "[webhooks/mercadopago] No matching order");
    return;
  }

  const [store] = await db
    .select({ mpAccessToken: storesTable.mpAccessToken })
    .from(storesTable)
    .where(eq(storesTable.id, order.storeId))
    .limit(1);

  const accessToken = store?.mpAccessToken;
  if (!accessToken) {
    logger.warn({ paymentId, storeId: order.storeId }, "[webhooks/mercadopago] Store has no MP access token");
    return;
  }

  const payment = await fetchMpPayment(paymentId, accessToken);
  if (!payment) return;

  if (payment.status === "approved") {
    await applyGatewayPayment({
      gateway: "mercadopago",
      transactionId: String(payment.id),
      paymentIntentId: paymentId,
      amount: Number(payment.transaction_amount ?? 0),
      status: "paid",
      paidAt: payment.date_approved ? new Date(payment.date_approved) : new Date(),
    });
  } else if (payment.status === "rejected") {
    await markOrderFailed(paymentId, "mercadopago");
  } else if (payment.status === "cancelled" || payment.status === "refunded" || payment.status === "charged_back") {
    await markOrderRefunded(paymentId, "mercadopago");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ApplyArgs {
  gateway: "stripe" | "mercadopago";
  transactionId: string;
  paymentIntentId: string;
  amount: number;
  status: "paid";
  paidAt: Date;
}

async function applyGatewayPayment(args: ApplyArgs): Promise<void> {
  const { gateway, transactionId, paymentIntentId, amount, paidAt } = args;
  if (amount <= 0) return;

  const [order] = await db
    .select({
      id: storeOrdersTable.id,
      orderNumber: storeOrdersTable.orderNumber,
      tenantId: storeOrdersTable.tenantId,
      clientId: storeOrdersTable.clientId,
      paymentMethod: storeOrdersTable.paymentMethod,
      paymentStatus: storeOrdersTable.paymentStatus,
    })
    .from(storeOrdersTable)
    .where(eq(storeOrdersTable.paymentIntentId, paymentIntentId))
    .limit(1);

  if (!order) {
    logger.info({ paymentIntentId, gateway }, "[webhooks] No matching order for paymentIntentId");
    return;
  }

  // Idempotency: if we already recorded this exact gateway transaction, stop.
  if (await paymentExistsForGatewayTx(order.tenantId, gateway, transactionId)) {
    logger.info({ paymentIntentId, gateway, transactionId }, "[webhooks] Duplicate event ignored");
    return;
  }

  // Mark the order paid
  if (order.paymentStatus !== "paid") {
    await db
      .update(storeOrdersTable)
      .set({ paymentStatus: "paid", paidAt, status: "confirmed", confirmedAt: paidAt })
      .where(eq(storeOrdersTable.id, order.id));
  }

  // Find the reservations linked to this order via storeOrderId == orderNumber
  const reservations = await db
    .select({ id: reservationsTable.id, totalValue: reservationsTable.totalValue })
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.tenantId, order.tenantId),
        eq(reservationsTable.storeOrderId, order.orderNumber),
      ),
    );

  if (reservations.length === 0) {
    logger.info({ orderId: order.id, paymentIntentId }, "[webhooks] Order has no linked reservations");
    return;
  }

  // Distribute the payment across reservations proportionally to their totals.
  // All inserted Payment rows share the SAME gateway transactionId. The
  // partial unique index on (tenant_id, gateway, transaction_id,
  // reservation_id) lets the multi-row split succeed while still rejecting
  // duplicates of the same (tx, reservation) tuple if the top-level
  // paymentExistsForGatewayTx guard races a concurrent webhook delivery.
  const totalReservationValue = reservations.reduce((acc, r) => acc + Number(r.totalValue), 0);
  if (totalReservationValue <= 0) return;

  let allocated = 0;
  for (let i = 0; i < reservations.length; i++) {
    const r = reservations[i]!;
    const isLast = i === reservations.length - 1;
    const share = isLast
      ? Math.round((amount - allocated) * 100) / 100
      : Math.round((Number(r.totalValue) / totalReservationValue) * amount * 100) / 100;
    allocated = Math.round((allocated + share) * 100) / 100;

    if (share <= 0) continue;

    await db.insert(paymentsTable).values({
      id: generateId(),
      tenantId: order.tenantId,
      reservationId: r.id,
      clientId: order.clientId ?? null,
      orderId: order.id,
      type: "receivable",
      category: "reservation",
      amount: String(share),
      paymentMethod: order.paymentMethod ?? gateway,
      installmentNumber: i + 1,
      totalInstallments: reservations.length,
      dueDate: paidAt,
      paidAt,
      status: "paid",
      gateway,
      transactionId,
      description: `Pagamento ${gateway} confirmado via webhook`,
    });

    await syncReservationPaymentStatus(r.id, order.tenantId);
  }

  logger.info(
    { orderId: order.id, gateway, transactionId, reservations: reservations.length, amount },
    "[webhooks] Gateway payment applied and reservations synced",
  );
}

async function markOrderFailed(paymentIntentId: string, gateway: string): Promise<void> {
  const [order] = await db
    .select({ id: storeOrdersTable.id, paymentStatus: storeOrdersTable.paymentStatus })
    .from(storeOrdersTable)
    .where(eq(storeOrdersTable.paymentIntentId, paymentIntentId))
    .limit(1);
  if (!order) return;
  if (order.paymentStatus === "paid") {
    logger.warn({ paymentIntentId, gateway }, "[webhooks] Failed event arrived after payment was marked paid; ignoring");
    return;
  }
  await db
    .update(storeOrdersTable)
    .set({ paymentStatus: "failed" })
    .where(eq(storeOrdersTable.id, order.id));
  logger.info({ orderId: order.id, gateway }, "[webhooks] Order marked failed");
}

async function markOrderRefunded(paymentIntentId: string, gateway: string): Promise<void> {
  const [order] = await db
    .select({
      id: storeOrdersTable.id,
      tenantId: storeOrdersTable.tenantId,
      orderNumber: storeOrdersTable.orderNumber,
    })
    .from(storeOrdersTable)
    .where(eq(storeOrdersTable.paymentIntentId, paymentIntentId))
    .limit(1);
  if (!order) return;

  const now = new Date();
  await db
    .update(storeOrdersTable)
    .set({ paymentStatus: "refunded", refundedAt: now, status: "cancelled", cancelledAt: now })
    .where(eq(storeOrdersTable.id, order.id));

  // Reverse paid payments tied to this order (mark them refunded so the
  // reservation balance recomputation demotes the reservation back to
  // pending). We don't delete history.
  await db
    .update(paymentsTable)
    .set({ status: "refunded" })
    .where(
      and(
        eq(paymentsTable.tenantId, order.tenantId),
        eq(paymentsTable.orderId, order.id),
        eq(paymentsTable.gateway, gateway),
      ),
    );

  const reservations = await db
    .select({ id: reservationsTable.id })
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.tenantId, order.tenantId),
        eq(reservationsTable.storeOrderId, order.orderNumber),
      ),
    );

  for (const r of reservations) {
    await syncReservationPaymentStatus(r.id, order.tenantId);
  }

  logger.info({ orderId: order.id, gateway, reservations: reservations.length }, "[webhooks] Order refunded and reservations resynced");
}

export default router;
