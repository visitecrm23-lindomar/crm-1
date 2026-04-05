import { Router } from "express";
import { db } from "@workspace/db";
import { campaignsTable, npsResponsesTable, productsTable, ordersTable, orderItemsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { generateId } from "../lib/id";
import { CreateCampaignBody, UpdateCampaignBody, CreateProductBody, UpdateProductBody, UpdateOrderBody } from "@workspace/api-zod";

const router = Router();

async function getTenantInfo(req: any) {
  const auth = req.auth;
  if (!auth?.userId) return null;
  const [me] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
  return me;
}

// Campaigns
router.get("/campaigns", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }
    const campaigns = await db.select().from(campaignsTable)
      .where(eq(campaignsTable.tenantId, me.tenantId)).orderBy(desc(campaignsTable.createdAt));
    res.json(campaigns.map(c => ({
      id: c.id, name: c.name, type: c.type, status: c.status, subject: c.subject,
      content: c.content, scheduledAt: c.scheduledAt?.toISOString() ?? null,
      sentAt: c.sentAt?.toISOString() ?? null, recipientsCount: c.recipientsCount,
      sentCount: c.sentCount, openedCount: c.openedCount, clickedCount: c.clickedCount,
      createdAt: c.createdAt.toISOString(),
    })));
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/campaigns", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateCampaignBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(campaignsTable).values({
      id, tenantId: me.tenantId ?? "default-tenant",
      name: parsed.data.name, type: parsed.data.type,
      subject: parsed.data.subject ?? null, content: parsed.data.content,
      targetSegment: parsed.data.targetSegment,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      createdById: me.id,
    });
    const [c] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id)).limit(1);
    res.status(201).json({ id: c.id, name: c.name, type: c.type, status: c.status, subject: c.subject,
      content: c.content, scheduledAt: c.scheduledAt?.toISOString() ?? null,
      sentAt: null, recipientsCount: 0, sentCount: 0, openedCount: 0, clickedCount: 0,
      createdAt: c.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  try {
    const parsed = UpdateCampaignBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: any = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.scheduledAt !== undefined) updates.scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
    if (parsed.data.content != null) updates.content = parsed.data.content;
    await db.update(campaignsTable).set(updates).where(eq(campaignsTable.id, req.params.id));
    const [c] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, req.params.id)).limit(1);
    if (!c) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: c.id, name: c.name, type: c.type, status: c.status, subject: c.subject,
      content: c.content, scheduledAt: c.scheduledAt?.toISOString() ?? null,
      sentAt: c.sentAt?.toISOString() ?? null, recipientsCount: c.recipientsCount,
      sentCount: c.sentCount, openedCount: c.openedCount, clickedCount: c.clickedCount,
      createdAt: c.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(campaignsTable).where(eq(campaignsTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

// NPS
router.get("/nps", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }
    const { classification, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let conditions: any[] = [eq(npsResponsesTable.tenantId, me.tenantId)];
    if (classification) conditions.push(eq(npsResponsesTable.classification, classification));

    const responses = await db.select().from(npsResponsesTable)
      .where(and(...conditions)).orderBy(desc(npsResponsesTable.createdAt))
      .limit(limitNum).offset(offset);

    res.json(responses.map(r => ({
      id: r.id, userId: r.userId, score: r.score, classification: r.classification,
      feedback: r.feedback, createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/nps/summary", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) {
      res.json({ averageScore: 0, npsScore: 0, promoters: 0, passives: 0, detractors: 0, total: 0 });
      return;
    }

    const responses = await db.select().from(npsResponsesTable)
      .where(eq(npsResponsesTable.tenantId, me.tenantId));

    let promoters = 0, passives = 0, detractors = 0, totalScore = 0;
    for (const r of responses) {
      totalScore += r.score;
      if (r.score >= 9) promoters++;
      else if (r.score >= 7) passives++;
      else detractors++;
    }

    const total = responses.length;
    const npsScore = total > 0 ? ((promoters - detractors) / total) * 100 : 0;
    const averageScore = total > 0 ? totalScore / total : 0;

    res.json({ averageScore: Math.round(averageScore * 10) / 10, npsScore: Math.round(npsScore), promoters, passives, detractors, total });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

// Products
router.get("/products", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }
    const { active } = req.query as Record<string, string>;
    let conditions: any[] = [eq(productsTable.tenantId, me.tenantId)];
    if (active !== undefined) conditions.push(eq(productsTable.active, active === "true"));
    const products = await db.select().from(productsTable)
      .where(and(...conditions)).orderBy(desc(productsTable.createdAt));
    res.json(products.map(p => ({
      id: p.id, name: p.name, slug: p.slug, description: p.description,
      type: p.type, price: Number(p.price), promotionalPrice: p.promotionalPrice ? Number(p.promotionalPrice) : null,
      stock: p.stock, active: p.active, featured: p.featured, createdAt: p.createdAt.toISOString(),
    })));
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/products", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateProductBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    const slug = parsed.data.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + id.slice(0, 4);
    await db.insert(productsTable).values({
      id, tenantId: me.tenantId ?? "default-tenant",
      name: parsed.data.name, slug,
      description: parsed.data.description ?? null, type: parsed.data.type,
      price: String(parsed.data.price),
      promotionalPrice: parsed.data.promotionalPrice ? String(parsed.data.promotionalPrice) : null,
      stock: parsed.data.stock ?? null,
    });
    const [p] = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1);
    res.status(201).json({ id: p.id, name: p.name, slug: p.slug, description: p.description,
      type: p.type, price: Number(p.price), promotionalPrice: p.promotionalPrice ? Number(p.promotionalPrice) : null,
      stock: p.stock, active: p.active, featured: p.featured, createdAt: p.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  try {
    const parsed = UpdateProductBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: any = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.price != null) updates.price = String(parsed.data.price);
    if (parsed.data.promotionalPrice !== undefined) updates.promotionalPrice = parsed.data.promotionalPrice ? String(parsed.data.promotionalPrice) : null;
    if (parsed.data.active != null) updates.active = parsed.data.active;
    if (parsed.data.featured != null) updates.featured = parsed.data.featured;
    if (parsed.data.stock !== undefined) updates.stock = parsed.data.stock;
    await db.update(productsTable).set(updates).where(eq(productsTable.id, req.params.id));
    const [p] = await db.select().from(productsTable).where(eq(productsTable.id, req.params.id)).limit(1);
    if (!p) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: p.id, name: p.name, slug: p.slug, description: p.description,
      type: p.type, price: Number(p.price), promotionalPrice: p.promotionalPrice ? Number(p.promotionalPrice) : null,
      stock: p.stock, active: p.active, featured: p.featured, createdAt: p.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(productsTable).where(eq(productsTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

// Orders
router.get("/orders", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }
    const { status, page = "1", limit = "20" } = req.query as Record<string, string>;
    let conditions: any[] = [eq(ordersTable.tenantId, me.tenantId)];
    if (status) conditions.push(eq(ordersTable.status, status));
    const orders = await db.select().from(ordersTable)
      .where(and(...conditions)).orderBy(desc(ordersTable.createdAt))
      .limit(parseInt(limit) || 20).offset(((parseInt(page) || 1) - 1) * (parseInt(limit) || 20));
    const items = await db.select().from(orderItemsTable);
    const itemsByOrder = items.reduce<Record<string, any[]>>((acc, item) => {
      if (!acc[item.orderId]) acc[item.orderId] = [];
      acc[item.orderId].push({ id: item.id, productId: item.productId, quantity: item.quantity, price: Number(item.price), productName: null });
      return acc;
    }, {});
    res.json(orders.map(o => ({
      id: o.id, userId: o.userId, totalAmount: Number(o.totalAmount), finalAmount: Number(o.finalAmount),
      status: o.status, paymentStatus: o.paymentStatus, createdAt: o.createdAt.toISOString(),
      items: itemsByOrder[o.id] ?? [],
    })));
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id)).limit(1);
    if (!order) { res.status(404).json({ error: "Not found" }); return; }
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, req.params.id));
    res.json({
      id: order.id, userId: order.userId, totalAmount: Number(order.totalAmount),
      finalAmount: Number(order.finalAmount), status: order.status, paymentStatus: order.paymentStatus,
      createdAt: order.createdAt.toISOString(),
      items: items.map(i => ({ id: i.id, productId: i.productId, quantity: i.quantity, price: Number(i.price), productName: null })),
    });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  try {
    const parsed = UpdateOrderBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: any = {};
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.paymentStatus != null) updates.paymentStatus = parsed.data.paymentStatus;
    await db.update(ordersTable).set(updates).where(eq(ordersTable.id, req.params.id));
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id)).limit(1);
    if (!order) { res.status(404).json({ error: "Not found" }); return; }
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, req.params.id));
    res.json({ id: order.id, userId: order.userId, totalAmount: Number(order.totalAmount),
      finalAmount: Number(order.finalAmount), status: order.status, paymentStatus: order.paymentStatus,
      createdAt: order.createdAt.toISOString(),
      items: items.map(i => ({ id: i.id, productId: i.productId, quantity: i.quantity, price: Number(i.price), productName: null })) });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
