import { Router } from "express";
import { db, tenantsTable, plansTable, invoicesTable, subscriptionsTable, usersTable, clientsTable, tripsTable } from "@workspace/db";
import { eq, and, count, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { generatePixEMV, generatePixQrCodeUrl } from "../lib/pix";

const router = Router();

router.get("/plans/list", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const plans = await db
      .select()
      .from(plansTable)
      .where(eq(plansTable.isActive, true))
      .orderBy(plansTable.sortOrder);
    res.json(plans);
  } catch (err) {
    req.log.error({ err }, "Error listing plans");
    res.status(500).json({ error: "Internal server error" });
  }
});

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
  planId: z.string().min(1),
  billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
});

router.post("/subscriptions/upgrade", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!me.tenantId) { res.status(400).json({ error: "No tenant" }); return; }
    if (me.role !== "agencia" && me.role !== "superadmin") {
      res.status(403).json({ error: "Apenas administradores podem alterar o plano" }); return;
    }

    const parsed = UpgradeBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [newPlan] = await db
      .select()
      .from(plansTable)
      .where(eq(plansTable.id, parsed.data.planId))
      .limit(1);
    if (!newPlan) { res.status(404).json({ error: "Plano não encontrado" }); return; }

    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, me.tenantId)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Tenant não encontrado" }); return; }

    const isDowngradeToFree = Number(newPlan.monthlyPrice) === 0;

    if (isDowngradeToFree) {
      await db.update(tenantsTable)
        .set({ planId: newPlan.slug, updatedAt: new Date() })
        .where(eq(tenantsTable.id, me.tenantId));

      await db.insert(subscriptionsTable).values({
        id: generateId(),
        tenantId: me.tenantId,
        planId: newPlan.id,
        status: "active",
        billingCycle: parsed.data.billingCycle,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      res.json({ upgraded: true, plan: newPlan, invoice: null });
      return;
    }

    const trialDays = newPlan.trialDays ?? 0;

    if (trialDays > 0) {
      const previousPaidSub = await db
        .select()
        .from(subscriptionsTable)
        .where(and(
          eq(subscriptionsTable.tenantId, me.tenantId),
          eq(subscriptionsTable.status, "active")
        ))
        .limit(1);

      if (previousPaidSub.length === 0) {
        const now = new Date();
        const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

        await db.update(tenantsTable)
          .set({ planId: newPlan.slug, status: "active", updatedAt: now })
          .where(eq(tenantsTable.id, me.tenantId));

        await db.insert(subscriptionsTable).values({
          id: generateId(),
          tenantId: me.tenantId,
          planId: newPlan.id,
          status: "trial",
          billingCycle: parsed.data.billingCycle,
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
          trialStart: now,
          trialEnd,
        });

        res.json({ upgraded: true, trial: true, trialDays, trialEndsAt: trialEnd, plan: newPlan, invoice: null });
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
    const invoiceNumber = `INV-${now.getFullYear()}-${String(invoiceId).slice(0, 8).toUpperCase()}`;

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
      status: "pending",
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

    if (me.role !== "superadmin" && invoice.tenantId !== me.tenantId) {
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
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden: superadmin only" }); return; }

    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, req.params.id)).limit(1);
    if (!invoice) { res.status(404).json({ error: "Fatura não encontrada" }); return; }
    if (invoice.status === "paid") { res.status(400).json({ error: "Fatura já está paga" }); return; }

    await db.update(invoicesTable).set({
      status: "paid",
      paidAt: new Date(),
    }).where(eq(invoicesTable.id, req.params.id));

    if (invoice.planId && invoice.tenantId) {
      const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, invoice.planId)).limit(1);
      if (plan) {
        await db.update(tenantsTable).set({
          planId: plan.slug,
          status: "active",
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
            status: "active",
            currentPeriodEnd: periodEnd,
          }).where(eq(subscriptionsTable.id, existingSub[0]!.id));
        } else {
          await db.insert(subscriptionsTable).values({
            id: generateId(),
            tenantId: invoice.tenantId,
            planId: plan.id,
            status: "active",
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
    if (me.role !== "superadmin" && invoice.tenantId !== me.tenantId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    if (invoice.status === "paid") { res.status(400).json({ error: "Fatura já está paga" }); return; }

    const origin = req.headers.origin ?? "https://app.visitecrm.com.br";
    const amountCents = Math.round(Number(invoice.amount) * 100);

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "payment_method_types[]": "card",
        "line_items[0][price_data][currency]": "brl",
        "line_items[0][price_data][unit_amount]": String(amountCents),
        "line_items[0][price_data][product_data][name]": invoice.description ?? "Assinatura VisiteCRM",
        "line_items[0][quantity]": "1",
        "mode": "payment",
        "success_url": `${origin}/configuracoes?payment=success&invoice=${invoice.id}`,
        "cancel_url": `${origin}/configuracoes?payment=cancelled`,
        "metadata[invoiceId]": invoice.id,
        "metadata[tenantId]": invoice.tenantId,
      }).toString(),
    });

    if (!response.ok) {
      const err = await response.json() as { error?: { message?: string } };
      req.log.error({ err }, "Stripe checkout error");
      res.status(502).json({ error: "Erro ao criar sessão de pagamento Stripe" });
      return;
    }

    const session = await response.json() as { id: string; url: string };

    await db.update(invoicesTable).set({
      paymentMethod: "card",
      stripePaymentIntentId: session.id,
    }).where(eq(invoicesTable.id, req.params.id));

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    req.log.error({ err }, "Error creating Stripe checkout");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/webhooks/stripe", async (req, res): Promise<void> => {
  try {
    const stripeKey = process.env["STRIPE_SECRET_KEY"];
    const stripeWebhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
    if (!stripeKey || !stripeWebhookSecret) {
      res.status(400).json({ error: "Stripe não configurado" });
      return;
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) { res.status(400).json({ error: "Missing stripe-signature header" }); return; }

    const body = req.body as { type: string; data: { object: { metadata?: { invoiceId?: string; tenantId?: string }; id?: string; payment_intent?: string; amount_total?: number } } };

    if (body.type === "checkout.session.completed") {
      const session = body.data.object;
      const invoiceId = session.metadata?.invoiceId;
      const tenantId = session.metadata?.tenantId;

      if (invoiceId && tenantId) {
        const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
        if (invoice && invoice.status !== "paid") {
          await db.update(invoicesTable).set({
            status: "paid",
            paidAt: new Date(),
            paymentMethod: "card",
          }).where(eq(invoicesTable.id, invoiceId));

          if (invoice.planId) {
            const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, invoice.planId)).limit(1);
            if (plan) {
              await db.update(tenantsTable).set({
                planId: plan.slug,
                status: "active",
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
                  status: "active",
                  currentPeriodEnd: periodEnd,
                }).where(eq(subscriptionsTable.id, existingSub[0]!.id));
              } else {
                await db.insert(subscriptionsTable).values({
                  id: generateId(),
                  tenantId,
                  planId: plan.id,
                  status: "active",
                  billingCycle: "monthly",
                  currentPeriodStart: new Date(),
                  currentPeriodEnd: periodEnd,
                });
              }
            }
          }
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    req.log.error({ err }, "Error processing Stripe webhook");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
