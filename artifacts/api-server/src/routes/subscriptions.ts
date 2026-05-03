import { Router } from "express";
import { db, tenantsTable, plansTable, invoicesTable, subscriptionsTable, usersTable, clientsTable, tripsTable } from "@workspace/db";
import { eq, and, or, count, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { generatePixEMV, generatePixQrCodeUrl } from "../lib/pix";
import { persistUsageSnapshot } from "../lib/planLimits";
import { generateInvoiceNumber } from "../lib/invoiceNumber";
import { ROLES, INVOICE_STATUS, TENANT_STATUS, SUBSCRIPTION_STATUS } from "@workspace/permissions";

const router = Router();

router.get("/subscriptions/current", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!me.tenantId) { res.status(404).json({ error: "No tenant" }); return; }

    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, me.tenantId)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

    const allPlans = await db.select().from(plansTable).where(eq(plansTable.isActive, true)).orderBy(plansTable.sortOrder);

    const currentPlan = allPlans.find(p => p.id === tenant.planId || p.slug === tenant.planId) ?? null;

    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.tenantId, me.tenantId))
      .orderBy(desc(subscriptionsTable.createdAt))
      .limit(1);

    const [userCountRow] = await db
      .select({ cnt: count() })
      .from(usersTable)
      .where(eq(usersTable.tenantId, me.tenantId));
    const [clientCountRow] = await db
      .select({ cnt: count() })
      .from(clientsTable)
      .where(eq(clientsTable.tenantId, me.tenantId));
    const [tripCountRow] = await db
      .select({ cnt: count() })
      .from(tripsTable)
      .where(eq(tripsTable.tenantId, me.tenantId));

    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.tenantId, me.tenantId))
      .orderBy(desc(invoicesTable.createdAt))
      .limit(10);

    const maxUsers = tenant.maxUsersOverride ?? currentPlan?.maxUsers ?? 3;
    const maxClients = tenant.maxClientsOverride ?? currentPlan?.maxClients ?? 500;
    const maxTrips = tenant.maxTripsOverride ?? currentPlan?.maxTrips ?? 20;

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        planId: tenant.planId,
        status: tenant.status,
        trialEndsAt: tenant.trialEndsAt,
      },
      plan: currentPlan,
      plans: allPlans,
      subscription: sub ?? null,
      usage: {
        users: userCountRow?.cnt ?? 0,
        clients: clientCountRow?.cnt ?? 0,
        trips: tripCountRow?.cnt ?? 0,
        maxUsers,
        maxClients,
        maxTrips,
      },
      invoices,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

const UpgradeBody = z.object({
  planId: z.string().optional(),
  planSlug: z.string().optional(),
  billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
}).refine(d => d.planId || d.planSlug, { message: "planId or planSlug is required" });

router.post("/subscriptions/upgrade", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!me.tenantId) { res.status(400).json({ error: "No tenant" }); return; }
    if (me.role !== ROLES.AGENCY_ADMIN && me.role !== ROLES.SUPER_ADMIN) {
      res.status(403).json({ error: "Apenas administradores podem alterar o plano" }); return;
    }

    const parsed = UpgradeBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const planConditions = [
      ...(parsed.data.planId ? [eq(plansTable.id, parsed.data.planId)] : []),
      ...(parsed.data.planSlug ? [eq(plansTable.slug, parsed.data.planSlug)] : []),
    ];
    const [newPlan] = await db
      .select()
      .from(plansTable)
      .where(planConditions.length === 1 ? planConditions[0] : or(...planConditions))
      .limit(1);
    if (!newPlan) { res.status(404).json({ error: "Plano não encontrado" }); return; }

    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, me.tenantId)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Tenant não encontrado" }); return; }

    const isDowngradeToFree = Number(newPlan.monthlyPrice) === 0;

    if (isDowngradeToFree) {
      await db.update(tenantsTable)
        .set({ planId: newPlan.slug, status: TENANT_STATUS.ACTIVE, updatedAt: new Date() })
        .where(eq(tenantsTable.id, me.tenantId));

      await db.update(subscriptionsTable)
        .set({ status: SUBSCRIPTION_STATUS.CANCELED, canceledAt: new Date() })
        .where(and(
          eq(subscriptionsTable.tenantId, me.tenantId),
          eq(subscriptionsTable.status, SUBSCRIPTION_STATUS.ACTIVE),
        ));

      await db.insert(subscriptionsTable).values({
        id: generateId(),
        tenantId: me.tenantId,
        planId: newPlan.id,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        billingCycle: parsed.data.billingCycle,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      res.json({ upgraded: true, plan: newPlan, invoice: null });
      return;
    }

    const trialDays = newPlan.trialDays ?? 0;

    if (trialDays > 0) {
      const priorTrialOrPaid = await db
        .select()
        .from(subscriptionsTable)
        .where(and(
          eq(subscriptionsTable.tenantId, me.tenantId),
          or(
            eq(subscriptionsTable.status, SUBSCRIPTION_STATUS.ACTIVE),
            eq(subscriptionsTable.status, SUBSCRIPTION_STATUS.TRIAL),
            eq(subscriptionsTable.status, SUBSCRIPTION_STATUS.CANCELED),
          )
        ))
        .limit(1);

      if (priorTrialOrPaid.length === 0) {
        const now = new Date();
        const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

        await db.update(tenantsTable)
          .set({ planId: newPlan.slug, status: TENANT_STATUS.ACTIVE, updatedAt: now })
          .where(eq(tenantsTable.id, me.tenantId));

        await db.insert(subscriptionsTable).values({
          id: generateId(),
          tenantId: me.tenantId,
          planId: newPlan.id,
          status: SUBSCRIPTION_STATUS.TRIAL,
          billingCycle: parsed.data.billingCycle,
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
          trialStart: now,
          trialEnd,
        });

        let trialInvoice = null;
        const trialPrice = parsed.data.billingCycle === "annual"
          ? Number(newPlan.annualPrice)
          : Number(newPlan.monthlyPrice);
        if (trialPrice > 0) {
          const trialInvoiceId = generateId();
          const trialInvoiceNumber = await generateInvoiceNumber(me.tenantId, now.getFullYear());
          const [inv] = await db.insert(invoicesTable).values({
            id: trialInvoiceId,
            tenantId: me.tenantId,
            planId: newPlan.id,
            invoiceNumber: trialInvoiceNumber,
            amount: String(trialPrice),
            totalAmount: String(trialPrice),
            currency: "BRL",
            status: INVOICE_STATUS.PENDING,
            paymentMethod: "pix",
            dueDate: trialEnd,
            description: `${newPlan.name} — ${parsed.data.billingCycle === "annual" ? "anual" : "mensal"} (vence após trial)`,
          }).returning();
          trialInvoice = inv;
        }

        void persistUsageSnapshot(me.tenantId);
        res.json({ upgraded: true, trial: true, trialDays, trialEndsAt: trialEnd, plan: newPlan, invoice: trialInvoice ?? null });
        return;
      }
    }

    const price = parsed.data.billingCycle === "annual"
      ? Number(newPlan.annualPrice)
      : Number(newPlan.monthlyPrice);

    const now = new Date();
    const periodStart = now;
    const periodEnd = parsed.data.billingCycle === "annual"
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const dueDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const invoiceId = generateId();
    const invoiceNumber = await generateInvoiceNumber(me.tenantId, now.getFullYear());

    const pixKey = process.env["PIX_KEY"];
    const pixName = process.env["PIX_NAME"] ?? "VisiteCRM";
    const pixCity = process.env["PIX_CITY"] ?? "SAO PAULO";

    let pixCode: string | undefined;
    let pixQrCodeUrl: string | undefined;
    const pixExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (pixKey) {
      pixCode = generatePixEMV({
        key: pixKey,
        name: pixName,
        city: pixCity,
        amount: price,
        txid: invoiceId.slice(0, 25),
        description: `Plano ${newPlan.name}`,
      });
      pixQrCodeUrl = generatePixQrCodeUrl(pixCode);
    }

    await db.insert(invoicesTable).values({
      id: invoiceId,
      invoiceNumber,
      tenantId: me.tenantId,
      planId: newPlan.id,
      amount: String(price),
      currency: "BRL",
      status: INVOICE_STATUS.PENDING,
      paymentMethod: pixKey ? "pix" : "manual",
      dueDate,
      description: `Assinatura ${newPlan.name} — ${parsed.data.billingCycle === "annual" ? "Anual" : "Mensal"}`,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      pixCode: pixCode ?? null,
      pixQrCodeUrl: pixQrCodeUrl ?? null,
      pixExpiresAt: pixKey ? pixExpiresAt : null,
    });

    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);

    await db.update(tenantsTable)
      .set({ status: TENANT_STATUS.PENDING_PAYMENT, pendingPlanId: newPlan.slug, updatedAt: now })
      .where(eq(tenantsTable.id, me.tenantId));

    void persistUsageSnapshot(me.tenantId);

    await db.insert(subscriptionsTable).values({
      id: generateId(),
      tenantId: me.tenantId,
      planId: newPlan.id,
      status: SUBSCRIPTION_STATUS.PENDING_PAYMENT,
      billingCycle: parsed.data.billingCycle,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });

    res.json({ upgraded: false, pendingInvoice: true, plan: newPlan, invoice });
  } catch (err) {
    req.log.error({ err }, "Error upgrading subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/invoices/:id/pix", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, req.params.id)).limit(1);
    if (!invoice) { res.status(404).json({ error: "Fatura não encontrada" }); return; }

    if (me.role !== ROLES.SUPER_ADMIN && invoice.tenantId !== me.tenantId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const pixKey = process.env["PIX_KEY"];
    if (!pixKey) { res.status(400).json({ error: "PIX não configurado. Entre em contato com o suporte." }); return; }

    const pixName = process.env["PIX_NAME"] ?? "VisiteCRM";
    const pixCity = process.env["PIX_CITY"] ?? "SAO PAULO";

    const pixCode = generatePixEMV({
      key: pixKey,
      name: pixName,
      city: pixCity,
      amount: Number(invoice.amount),
      txid: invoice.id.slice(0, 25),
      description: invoice.description?.slice(0, 40) ?? "Assinatura VisiteCRM",
    });
    const pixQrCodeUrl = generatePixQrCodeUrl(pixCode);
    const pixExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.update(invoicesTable).set({
      pixCode,
      pixQrCodeUrl,
      pixExpiresAt,
      paymentMethod: "pix",
      status: INVOICE_STATUS.PROCESSING,
    }).where(eq(invoicesTable.id, req.params.id));

    const [updated] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, req.params.id)).limit(1);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error generating PIX");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/invoices/:id/confirm-payment", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.SUPER_ADMIN) { res.status(403).json({ error: "Forbidden: superadmin only" }); return; }

    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, req.params.id)).limit(1);
    if (!invoice) { res.status(404).json({ error: "Fatura não encontrada" }); return; }
    if (invoice.status === INVOICE_STATUS.PAID) { res.status(400).json({ error: "Fatura já está paga" }); return; }

    await db.update(invoicesTable).set({
      status: INVOICE_STATUS.PAID,
      paidAt: new Date(),
    }).where(eq(invoicesTable.id, req.params.id));

    if (invoice.planId && invoice.tenantId) {
      const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, invoice.planId)).limit(1);
      if (plan) {
        await db.update(tenantsTable).set({
          planId: plan.slug,
          pendingPlanId: null,
          status: TENANT_STATUS.ACTIVE,
        }).where(eq(tenantsTable.id, invoice.tenantId));

        const existingSub = await db
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.tenantId, invoice.tenantId))
          .orderBy(desc(subscriptionsTable.createdAt))
          .limit(1);

        const periodEnd = invoice.billingPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        if (existingSub.length > 0) {
          await db.update(subscriptionsTable).set({
            planId: plan.id,
            status: SUBSCRIPTION_STATUS.ACTIVE,
            currentPeriodEnd: periodEnd,
          }).where(eq(subscriptionsTable.id, existingSub[0]!.id));
        } else {
          await db.insert(subscriptionsTable).values({
            id: generateId(),
            tenantId: invoice.tenantId,
            planId: plan.id,
            status: SUBSCRIPTION_STATUS.ACTIVE,
            billingCycle: "monthly",
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
          });
        }
      }
    }

    const [updated] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, req.params.id)).limit(1);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error confirming payment");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/invoices/:id/stripe/checkout", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const stripeKey = process.env["STRIPE_SECRET_KEY"];
    if (!stripeKey) {
      res.status(400).json({ error: "Stripe não configurado. Entre em contato com o suporte." });
      return;
    }

    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, req.params.id)).limit(1);
    if (!invoice) { res.status(404).json({ error: "Fatura não encontrada" }); return; }
    if (me.role !== ROLES.SUPER_ADMIN && invoice.tenantId !== me.tenantId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    if (invoice.status === INVOICE_STATUS.PAID) { res.status(400).json({ error: "Fatura já está paga" }); return; }

    const amountCents = Math.round(Number(invoice.amount) * 100);

    const piBody = new URLSearchParams({
      amount: String(amountCents),
      currency: "brl",
      "payment_method_types[]": "card",
      "metadata[invoiceId]": invoice.id,
      "metadata[tenantId]": invoice.tenantId,
      description: invoice.description ?? "Assinatura VisiteCRM",
    });

    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: piBody.toString(),
    });

    if (!response.ok) {
      const errBody = await response.json() as { error?: { message?: string } };
      req.log.error({ errBody }, "Stripe PaymentIntent error");
      res.status(502).json({ error: "Erro ao criar intenção de pagamento Stripe" });
      return;
    }

    const pi = await response.json() as { id: string; client_secret: string };

    await db.update(invoicesTable).set({
      paymentMethod: "card",
      stripePaymentIntentId: pi.id,
    }).where(eq(invoicesTable.id, req.params.id));

    res.json({ clientSecret: pi.client_secret, paymentIntentId: pi.id });
  } catch (err) {
    req.log.error({ err }, "Error creating Stripe PaymentIntent");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function activateInvoicePlan(
  invoiceId: string,
  tenantId: string,
  log: { error: (obj: object, msg: string) => void }
): Promise<void> {
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
  if (!invoice || invoice.status === INVOICE_STATUS.PAID) return;

  await db.update(invoicesTable).set({
    status: INVOICE_STATUS.PAID,
    paidAt: new Date(),
  }).where(eq(invoicesTable.id, invoiceId));

  if (invoice.planId) {
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, invoice.planId)).limit(1);
    if (plan) {
      await db.update(tenantsTable).set({
        planId: plan.slug,
        pendingPlanId: null,
        status: TENANT_STATUS.ACTIVE,
        updatedAt: new Date(),
      }).where(eq(tenantsTable.id, tenantId));

      const existingSub = await db
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.tenantId, tenantId))
        .orderBy(desc(subscriptionsTable.createdAt))
        .limit(1);

      const periodEnd = invoice.billingPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      if (existingSub.length > 0) {
        await db.update(subscriptionsTable).set({
          planId: plan.id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          currentPeriodEnd: periodEnd,
        }).where(eq(subscriptionsTable.id, existingSub[0]!.id));
      } else {
        await db.insert(subscriptionsTable).values({
          id: generateId(),
          tenantId,
          planId: plan.id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          billingCycle: "monthly",
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        });
      }
    }
  }
}

async function failInvoice(invoiceId: string): Promise<void> {
  await db.update(invoicesTable).set({
    status: INVOICE_STATUS.FAILED,
    notes: "Pagamento falhou via Stripe",
  }).where(eq(invoicesTable.id, invoiceId));
}

router.post("/webhooks/stripe", async (req, res): Promise<void> => {
  try {
    const stripeWebhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
    if (!stripeWebhookSecret) {
      res.status(400).json({ error: "Stripe webhook não configurado" });
      return;
    }

    const sig = req.headers["stripe-signature"] as string | undefined;
    if (!sig) { res.status(400).json({ error: "Missing stripe-signature header" }); return; }

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "Raw body não disponível para verificação de assinatura" });
      return;
    }

    const crypto = await import("crypto");
    const [timestampPart, v1Part] = sig.split(",").reduce<[string, string]>((acc, part) => {
      if (part.startsWith("t=")) acc[0] = part.slice(2);
      if (part.startsWith("v1=")) acc[1] = part.slice(3);
      return acc;
    }, ["", ""]);

    const signedPayload = `${timestampPart}.${rawBody.toString("utf8")}`;
    const expectedSig = crypto.createHmac("sha256", stripeWebhookSecret)
      .update(signedPayload, "utf8")
      .digest("hex");

    if (expectedSig !== v1Part) {
      req.log.warn("Stripe webhook signature verification failed");
      res.status(400).json({ error: "Assinatura inválida" });
      return;
    }

    const tsDiff = Math.abs(Date.now() / 1000 - Number(timestampPart));
    if (tsDiff > 300) {
      req.log.warn({ tsDiff }, "Stripe webhook timestamp too old");
      res.status(400).json({ error: "Webhook timestamp fora do prazo" });
      return;
    }

    interface StripeEvent {
      type: string;
      data: { object: { id?: string; metadata?: { invoiceId?: string; tenantId?: string }; status?: string; last_payment_error?: unknown } };
    }
    const event = req.body as StripeEvent;

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const invoiceId = pi.metadata?.invoiceId;
      const tenantId = pi.metadata?.tenantId;
      if (invoiceId && tenantId) {
        await activateInvoicePlan(invoiceId, tenantId, req.log);
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;
      const invoiceId = pi.metadata?.invoiceId;
      if (invoiceId) {
        await failInvoice(invoiceId);
      }
    }

    res.json({ received: true });
  } catch (err) {
    req.log.error({ err }, "Error processing Stripe webhook");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
