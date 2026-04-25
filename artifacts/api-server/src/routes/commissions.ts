import { Router } from "express";
import { db, commissionRulesTable, commissionsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { ADMIN_ROLES } from '../lib/tenant';

const router = Router();
const ADMIN_ROLES = ADMIN_ROLES;

const CreateRuleBody = z.object({
  name: z.string().min(1),
  type: z.enum(["percentage", "fixed"]).optional(),
  value: z.string(),
  appliesTo: z.string().optional(),
  tripId: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get("/commission-rules", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const rules = await db.select().from(commissionRulesTable)
      .where(eq(commissionRulesTable.tenantId, me.tenantId))
      .orderBy(desc(commissionRulesTable.createdAt));
    res.json(rules);
  } catch (err) {
    req.log.error({ err }, "Error listing commission rules");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/commission-rules", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateRuleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(commissionRulesTable).values({ id, tenantId: me.tenantId, ...parsed.data });
    const [rule] = await db.select().from(commissionRulesTable).where(eq(commissionRulesTable.id, id)).limit(1);
    res.status(201).json(rule);
  } catch (err) {
    req.log.error({ err }, "Error creating commission rule");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/commission-rules/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateRuleBody.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(commissionRulesTable).set(parsed.data)
      .where(and(eq(commissionRulesTable.id, req.params.id), eq(commissionRulesTable.tenantId, me.tenantId)));
    const [rule] = await db.select().from(commissionRulesTable)
      .where(and(eq(commissionRulesTable.id, req.params.id), eq(commissionRulesTable.tenantId, me.tenantId))).limit(1);
    if (!rule) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rule);
  } catch (err) {
    req.log.error({ err }, "Error updating commission rule");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/commission-rules/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(commissionRulesTable)
      .where(and(eq(commissionRulesTable.id, req.params.id), eq(commissionRulesTable.tenantId, me.tenantId)));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting commission rule");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/commissions/calculate", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const { sellerId, saleAmount, tripId } = req.query as Record<string, string>;
    if (!sellerId || !saleAmount) {
      res.status(400).json({ error: "sellerId and saleAmount are required" });
      return;
    }
    const amount = parseFloat(saleAmount);
    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: "saleAmount must be a positive number" });
      return;
    }

    // Check commission rules first (trip-specific, then all)
    const rules = await db.select().from(commissionRulesTable)
      .where(and(eq(commissionRulesTable.tenantId, me.tenantId), eq(commissionRulesTable.isActive, true)));

    const tripSpecificRule = tripId ? rules.find(r => r.appliesTo === "trip" && r.tripId === tripId) : undefined;
    const allRule = rules.find(r => r.appliesTo === "all");
    const rule = tripSpecificRule ?? allRule;

    if (rule) {
      const commissionAmount = rule.type === "percentage"
        ? (amount * parseFloat(String(rule.value))) / 100
        : parseFloat(String(rule.value));
      res.json({
        commissionAmount: Math.round(commissionAmount * 100) / 100,
        commissionRate: parseFloat(String(rule.value)),
        commissionType: rule.type ?? "percentage",
        source: "rule",
        saleAmount: amount,
      });
      return;
    }

    // Fallback: seller's personal commission config
    const [seller] = await db.select({
      commissionType: usersTable.commissionType,
      commissionRate: usersTable.commissionRate,
      commissionFixed: usersTable.commissionFixed,
    }).from(usersTable)
      .where(and(eq(usersTable.id, sellerId), eq(usersTable.tenantId, me.tenantId)))
      .limit(1);

    if (!seller) { res.status(404).json({ error: "Seller not found" }); return; }

    const rate = parseFloat(String(seller.commissionRate ?? "0"));
    const fixed = parseFloat(String(seller.commissionFixed ?? "0"));

    if (seller.commissionType === "none") {
      res.json({ commissionAmount: 0, commissionRate: null, commissionType: "none", source: "seller", saleAmount: amount });
    } else if (seller.commissionType === "fixed" && fixed > 0) {
      res.json({ commissionAmount: fixed, commissionRate: null, commissionType: "fixed", source: "seller", saleAmount: amount });
    } else if (seller.commissionType === "hybrid") {
      const pct = rate > 0 ? Math.round((amount * rate / 100) * 100) / 100 : 0;
      const commissionAmount = Math.round((pct + fixed) * 100) / 100;
      res.json({ commissionAmount, commissionRate: rate, commissionType: "hybrid", source: "seller", saleAmount: amount });
    } else if (rate > 0) {
      const commissionAmount = Math.round((amount * rate / 100) * 100) / 100;
      res.json({ commissionAmount, commissionRate: rate, commissionType: "percentage", source: "seller", saleAmount: amount });
    } else {
      res.json({ commissionAmount: 0, commissionRate: 0, commissionType: "percentage", source: "none", saleAmount: amount });
    }
  } catch (err) {
    req.log.error({ err }, "Error calculating commission");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/commissions/my-rank", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const result = await db.execute(sql`
      SELECT
        user_id,
        COALESCE(SUM(commission_amount::numeric), 0) AS total_commission
      FROM commissions
      WHERE tenant_id = ${me.tenantId}
        AND status IN ('pending', 'paid', 'approved')
        AND to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') = ${month}
      GROUP BY user_id
      ORDER BY total_commission DESC
    `);

    const rows = result.rows as Array<{ user_id: string; total_commission: string }>;
    const userIndex = rows.findIndex(r => r.user_id === me.id);
    const myRow = rows.find(r => r.user_id === me.id);

    res.json({
      rank: userIndex >= 0 ? userIndex + 1 : null,
      totalSellers: rows.length,
      monthlyCommission: myRow ? parseFloat(myRow.total_commission) : 0,
      month,
    });
  } catch (err) {
    req.log.error({ err }, "Error computing commission rank");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/commissions", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    // Vendedores can see their own commissions only; admins see all
    let commissions;
    if (ADMIN_ROLES.includes(me.role)) {
      commissions = await db.select().from(commissionsTable)
        .where(eq(commissionsTable.tenantId, me.tenantId))
        .orderBy(desc(commissionsTable.createdAt));
    } else {
      commissions = await db.select().from(commissionsTable)
        .where(and(
          eq(commissionsTable.tenantId, me.tenantId),
          eq(commissionsTable.userId, me.id),
        ))
        .orderBy(desc(commissionsTable.createdAt));
    }
    res.json(commissions);
  } catch (err) {
    req.log.error({ err }, "Error listing commissions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/commissions/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = z.object({ status: z.string().optional(), paidAt: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Record<string, unknown> = {};
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.paidAt) updates.paidAt = new Date(parsed.data.paidAt);
    await db.update(commissionsTable).set(updates)
      .where(and(eq(commissionsTable.id, req.params.id), eq(commissionsTable.tenantId, me.tenantId)));
    const [commission] = await db.select().from(commissionsTable)
      .where(and(eq(commissionsTable.id, req.params.id), eq(commissionsTable.tenantId, me.tenantId))).limit(1);
    if (!commission) { res.status(404).json({ error: "Not found" }); return; }
    res.json(commission);
  } catch (err) {
    req.log.error({ err }, "Error updating commission");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
