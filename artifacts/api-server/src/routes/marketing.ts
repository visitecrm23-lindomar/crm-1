import { Router } from "express";
import { db } from "@workspace/db";
import { campaignsTable, npsResponsesTable, productsTable, ordersTable, orderItemsTable, clientsTable, reservationsTable } from "@workspace/db";
import { eq, and, desc, inArray, avg, sql, or } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { z } from "zod";
import { ADMIN_ROLES } from '../lib/tenant';
import { STORE_ORDER_STATUS, STORE_PAYMENT_STATUS } from "@workspace/permissions";

const router = Router();

const CreateCampaignBody = z.object({
  name: z.string(),
  type: z.string().default("email"),
  subject: z.string().optional(),
  content: z.string(),
  targetSegment: z.record(z.unknown()).optional(),
  scheduledAt: z.string().optional(),
});

const UpdateCampaignBody = z.object({
  name: z.string().optional(),
  status: z.string().optional(),
  content: z.string().optional(),
  subject: z.string().optional(),
  targetSegment: z.record(z.unknown()).optional(),
  scheduledAt: z.string().optional().nullable(),
});

const CreateNpsResponseBody = z.object({
  userId: z.string(),
  orderId: z.string().optional(),
  score: z.number().int().min(0).max(10),
  feedback: z.string().optional(),
});

const SendNpsBody = z.object({
  tripId: z.string(),
  clientIds: z.array(z.string()).optional(),
});

const CreateProductBody = z.object({
  name: z.string(),
  slug: z.string().optional(),
  type: z.string().default("physical"),
  description: z.string().optional(),
  price: z.number(),
  promotionalPrice: z.number().optional(),
  stock: z.number().optional(),
  trackStock: z.boolean().optional(),
  featured: z.boolean().optional(),
});

const UpdateProductBody = z.object({
  name: z.string().optional(),
  price: z.number().optional(),
  promotionalPrice: z.number().optional().nullable(),
  stock: z.number().optional(),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
  description: z.string().optional().nullable(),
});

const CreateOrderBody = z.object({
  userId: z.string(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).optional(),
});

const UpdateOrderBody = z.object({
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
});

function formatCampaign(c: typeof campaignsTable.$inferSelect) {
  return {
    id: c.id, tenantId: c.tenantId, name: c.name, type: c.type,
    status: c.status, subject: c.subject, content: c.content,
    targetSegment: c.targetSegment ?? {},
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    sentAt: c.sentAt?.toISOString() ?? null,
    recipientsCount: c.recipientsCount, sentCount: c.sentCount,
    deliveredCount: c.deliveredCount, openedCount: c.openedCount, clickedCount: c.clickedCount,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}

function formatProduct(p: typeof productsTable.$inferSelect) {
  return {
    id: p.id, tenantId: p.tenantId, name: p.name, slug: p.slug,
    description: p.description, shortDescription: p.shortDescription,
    type: p.type, price: Number(p.price),
    promotionalPrice: p.promotionalPrice ? Number(p.promotionalPrice) : null,
    cost: p.cost ? Number(p.cost) : null,
    stock: p.stock, trackStock: p.trackStock, active: p.active, featured: p.featured,
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  };
}

function formatOrder(o: typeof ordersTable.$inferSelect) {
  return {
    id: o.id, tenantId: o.tenantId, userId: o.userId,
    status: o.status, totalAmount: Number(o.totalAmount),
    finalAmount: Number(o.finalAmount),
    discountApplied: Number(o.discountApplied),
    paymentStatus: o.paymentStatus,
    createdAt: o.createdAt.toISOString(),
    paidAt: o.paidAt?.toISOString() ?? null,
  };
}

router.get("/campaigns", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const campaigns = await db.select().from(campaignsTable)
      .where(eq(campaignsTable.tenantId, me.tenantId))
      .orderBy(desc(campaignsTable.createdAt));
    res.json(campaigns.map(formatCampaign));
  } catch (err) {
    req.log.error({ err }, "Error listing campaigns");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/campaigns", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateCampaignBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(campaignsTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      type: parsed.data.type,
      status: "draft",
      subject: parsed.data.subject ?? null,
      content: parsed.data.content,
      targetSegment: parsed.data.targetSegment ?? {},
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      createdById: me.id,
    });
    const [campaign] = await db.select().from(campaignsTable)
      .where(and(eq(campaignsTable.id, id), eq(campaignsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!campaign) { res.status(500).json({ error: "Failed to create campaign" }); return; }
    res.status(201).json(formatCampaign(campaign));
  } catch (err) {
    req.log.error({ err }, "Error creating campaign");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateCampaignBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof campaignsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.content != null) updates.content = parsed.data.content;
    if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject ?? null;
    if (parsed.data.targetSegment != null) updates.targetSegment = parsed.data.targetSegment;
    if (parsed.data.scheduledAt !== undefined) updates.scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
    await db.update(campaignsTable).set(updates)
      .where(and(eq(campaignsTable.id, req.params.id), eq(campaignsTable.tenantId, me.tenantId)));
    const [campaign] = await db.select().from(campaignsTable)
      .where(and(eq(campaignsTable.id, req.params.id), eq(campaignsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatCampaign(campaign));
  } catch (err) {
    req.log.error({ err }, "Error updating campaign");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(campaignsTable)
      .where(and(eq(campaignsTable.id, req.params.id), eq(campaignsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting campaign");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/nps/summary", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const responses = await db.select().from(npsResponsesTable)
      .where(eq(npsResponsesTable.tenantId, me.tenantId));
    const total = responses.length;
    const promoters = responses.filter(r => r.classification === "promoter").length;
    const detractors = responses.filter(r => r.classification === "detractor").length;
    const npsScore = total === 0 ? 0 : Math.round(((promoters - detractors) / total) * 100);
    const avg = total === 0 ? 0 : responses.reduce((s, r) => s + r.score, 0) / total;
    res.json({
      total,
      promoters,
      passives: responses.filter(r => r.classification === "passive").length,
      detractors,
      npsScore,
      averageScore: Math.round(avg * 10) / 10,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching NPS summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/nps", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const rows = await db
      .select({
        id: npsResponsesTable.id,
        tenantId: npsResponsesTable.tenantId,
        userId: npsResponsesTable.userId,
        orderId: npsResponsesTable.orderId,
        score: npsResponsesTable.score,
        classification: npsResponsesTable.classification,
        feedback: npsResponsesTable.feedback,
        createdAt: npsResponsesTable.createdAt,
        clientName: clientsTable.name,
      })
      .from(npsResponsesTable)
      .leftJoin(
        clientsTable,
        and(
          eq(clientsTable.tenantId, npsResponsesTable.tenantId),
          or(
            eq(clientsTable.userId, npsResponsesTable.userId),
            eq(clientsTable.id, npsResponsesTable.userId),
          ),
        ),
      )
      .where(eq(npsResponsesTable.tenantId, me.tenantId))
      .orderBy(desc(npsResponsesTable.createdAt));
    const classification = req.query.classification as string | undefined;
    const filtered = classification && classification !== "all"
      ? rows.filter(r => r.classification === classification)
      : rows;
    res.json(filtered.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      userId: r.userId,
      orderId: r.orderId,
      score: r.score,
      classification: r.classification,
      feedback: r.feedback,
      clientName: r.clientName ?? null,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing NPS responses");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/nps/send", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = SendNpsBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { tripId, clientIds } = parsed.data;
    const reservations = await db
      .select({ clientId: reservationsTable.clientId })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.tenantId, me.tenantId),
          eq(reservationsTable.tripId, tripId),
        ),
      );

    const allClientIds = [...new Set(reservations.map(r => r.clientId))];
    const targetIds = clientIds && clientIds.length > 0
      ? allClientIds.filter(id => clientIds.includes(id))
      : allClientIds;

    if (targetIds.length === 0) {
      res.json({ links: [] });
      return;
    }

    const clients = await db
      .select({ id: clientsTable.id, name: clientsTable.name })
      .from(clientsTable)
      .where(
        and(
          eq(clientsTable.tenantId, me.tenantId),
          inArray(clientsTable.id, targetIds),
        ),
      );

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const links = clients.map(c => {
      const token = Buffer.from(`${c.id}:${me.tenantId}:${tripId}`).toString("base64url");
      return { clientId: c.id, clientName: c.name, surveyUrl: `${baseUrl}/nps/survey?token=${token}` };
    });

    res.json({ links });
  } catch (err) {
    req.log.error({ err }, "Error sending NPS survey");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/nps", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateNpsResponseBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const id = generateId();
    const classification = parsed.data.score >= 9 ? "promoter" : parsed.data.score >= 7 ? "passive" : "detractor";
    await db.insert(npsResponsesTable).values({
      id,
      tenantId: me.tenantId,
      userId: parsed.data.userId,
      orderId: parsed.data.orderId ?? null,
      score: parsed.data.score,
      classification,
      feedback: parsed.data.feedback ?? null,
    });

    const allScores = await db
      .select({ score: npsResponsesTable.score })
      .from(npsResponsesTable)
      .where(
        and(
          eq(npsResponsesTable.userId, parsed.data.userId),
          eq(npsResponsesTable.tenantId, me.tenantId),
        ),
      );
    const avgScore = allScores.length > 0
      ? Math.round(allScores.reduce((sum, r) => sum + r.score, 0) / allScores.length)
      : null;
    await db
      .update(clientsTable)
      .set({ npsScore: avgScore })
      .where(
        and(
          eq(clientsTable.userId, parsed.data.userId),
          eq(clientsTable.tenantId, me.tenantId),
        ),
      );

    const [nps] = await db.select().from(npsResponsesTable)
      .where(and(eq(npsResponsesTable.id, id), eq(npsResponsesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!nps) { res.status(500).json({ error: "Failed to create NPS response" }); return; }
    res.status(201).json({ id: nps.id, score: nps.score, classification: nps.classification });
  } catch (err) {
    req.log.error({ err }, "Error creating NPS response");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const products = await db.select().from(productsTable)
      .where(eq(productsTable.tenantId, me.tenantId))
      .orderBy(desc(productsTable.createdAt));
    res.json(products.map(formatProduct));
  } catch (err) {
    req.log.error({ err }, "Error listing products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/products", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateProductBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    const slug = parsed.data.slug ?? (parsed.data.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + id.slice(0, 4));
    await db.insert(productsTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      slug,
      type: parsed.data.type,
      description: parsed.data.description ?? null,
      price: String(parsed.data.price),
      promotionalPrice: parsed.data.promotionalPrice ? String(parsed.data.promotionalPrice) : null,
      stock: parsed.data.stock ?? null,
      trackStock: parsed.data.trackStock ?? true,
      featured: parsed.data.featured ?? false,
    });
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!product) { res.status(500).json({ error: "Failed to create product" }); return; }
    res.status(201).json(formatProduct(product));
  } catch (err) {
    req.log.error({ err }, "Error creating product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateProductBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof productsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.price != null) updates.price = String(parsed.data.price);
    if (parsed.data.promotionalPrice !== undefined) updates.promotionalPrice = parsed.data.promotionalPrice ? String(parsed.data.promotionalPrice) : null;
    if (parsed.data.stock != null) updates.stock = parsed.data.stock;
    if (parsed.data.active != null) updates.active = parsed.data.active;
    if (parsed.data.featured != null) updates.featured = parsed.data.featured;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
    await db.update(productsTable).set(updates)
      .where(and(eq(productsTable.id, req.params.id), eq(productsTable.tenantId, me.tenantId)));
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, req.params.id), eq(productsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!product) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatProduct(product));
  } catch (err) {
    req.log.error({ err }, "Error updating product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(productsTable)
      .where(and(eq(productsTable.id, req.params.id), eq(productsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const orders = await db.select().from(ordersTable)
      .where(eq(ordersTable.tenantId, me.tenantId))
      .orderBy(desc(ordersTable.createdAt));

    if (orders.length === 0) { res.json([]); return; }

    const orderIds = orders.map(o => o.id);
    const items = await db.select().from(orderItemsTable)
      .where(inArray(orderItemsTable.orderId, orderIds));

    const itemsByOrder = items.reduce<Record<string, typeof orderItemsTable.$inferSelect[]>>((acc, item) => {
      if (!acc[item.orderId]) acc[item.orderId] = [];
      acc[item.orderId].push(item);
      return acc;
    }, {});

    res.json(orders.map(o => ({
      ...formatOrder(o),
      items: (itemsByOrder[o.id] ?? []).map(i => ({
        id: i.id, productId: i.productId, quantity: i.quantity, price: Number(i.price),
      })),
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/orders", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateOrderBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const items = parsed.data.items ?? [];
    let totalAmount = 0;
    const priceMap: Record<string, number> = {};
    for (const item of items) {
      const [product] = await db.select().from(productsTable)
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!product) { res.status(400).json({ error: `Product ${item.productId} not found or not in tenant` }); return; }
      const unitPrice = Number(product.promotionalPrice ?? product.price);
      priceMap[item.productId] = unitPrice;
      totalAmount += unitPrice * item.quantity;
    }

    const id = generateId();
    await db.insert(ordersTable).values({
      id,
      tenantId: me.tenantId,
      userId: parsed.data.userId,
      totalAmount: String(totalAmount),
      discountApplied: "0",
      bonusUsed: "0",
      shippingCost: "0",
      finalAmount: String(totalAmount),
      status: STORE_ORDER_STATUS.PENDING,
      paymentStatus: STORE_PAYMENT_STATUS.PENDING,
    });

    for (const item of items) {
      const unitPrice = priceMap[item.productId]!;
      await db.insert(orderItemsTable).values({
        id: generateId(),
        orderId: id,
        productId: item.productId,
        quantity: item.quantity,
        price: String(unitPrice),
      });
    }

    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, id), eq(ordersTable.tenantId, me.tenantId)))
      .limit(1);
    if (!order) { res.status(500).json({ error: "Failed to create order" }); return; }
    res.status(201).json(formatOrder(order));
  } catch (err) {
    req.log.error({ err }, "Error creating order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, req.params.id), eq(ordersTable.tenantId, me.tenantId)))
      .limit(1);
    if (!order) { res.status(404).json({ error: "Not found" }); return; }
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, req.params.id));
    res.json({
      ...formatOrder(order),
      items: items.map(i => ({
        id: i.id, productId: i.productId, quantity: i.quantity, price: Number(i.price),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateOrderBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof ordersTable.$inferInsert> = {};
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.paymentStatus != null) updates.paymentStatus = parsed.data.paymentStatus;
    await db.update(ordersTable).set(updates)
      .where(and(eq(ordersTable.id, req.params.id), eq(ordersTable.tenantId, me.tenantId)));
    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, req.params.id), eq(ordersTable.tenantId, me.tenantId)))
      .limit(1);
    if (!order) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatOrder(order));
  } catch (err) {
    req.log.error({ err }, "Error updating order");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
