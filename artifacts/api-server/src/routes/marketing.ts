import { Router } from "express";
import { db } from "@workspace/db";
import { campaignsTable, npsResponsesTable, productsTable, ordersTable, orderItemsTable, clientsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import {
  CreateCampaignBody, UpdateCampaignBody,
  CreateProductBody, UpdateProductBody,
  UpdateOrderBody,
} from "@workspace/api-zod";
import { z } from "zod";

const CreateNpsResponseBody = z.object({
  clientId: z.string().optional(),
  tripId: z.string().optional(),
  score: z.number().int().min(0).max(10),
  feedback: z.string().optional(),
});

const CreateOrderBody = z.object({
  clientId: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).optional(),
});

const router = Router();

function formatCampaign(c: typeof campaignsTable.$inferSelect) {
  return {
    id: c.id, tenantId: c.tenantId, name: c.name, type: c.type,
    channel: c.channel, status: c.status,
    targetAudience: c.targetAudience ?? {}, content: c.content ?? {},
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    sentAt: c.sentAt?.toISOString() ?? null,
    sentCount: c.sentCount, openCount: c.openCount, clickCount: c.clickCount,
    budget: c.budget ? Number(c.budget) : null,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}

function formatProduct(p: typeof productsTable.$inferSelect) {
  return {
    id: p.id, tenantId: p.tenantId, name: p.name, description: p.description,
    category: p.category, price: Number(p.price),
    discountPrice: p.discountPrice ? Number(p.discountPrice) : null,
    stock: p.stock, images: p.images ?? [], isActive: p.isActive,
    tags: p.tags ?? [], createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  };
}

function formatOrder(o: typeof ordersTable.$inferSelect) {
  return {
    id: o.id, tenantId: o.tenantId, clientId: o.clientId,
    status: o.status, totalAmount: Number(o.totalAmount),
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    notes: o.notes,
    createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(),
  };
}

router.get("/campaigns", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
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
    const parsed = CreateCampaignBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(campaignsTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      type: parsed.data.type,
      channel: parsed.data.channel,
      status: "draft",
      targetAudience: parsed.data.targetAudience ?? {},
      content: parsed.data.content ?? {},
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      budget: parsed.data.budget ? String(parsed.data.budget) : null,
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
    const parsed = UpdateCampaignBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof campaignsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.content != null) updates.content = parsed.data.content;
    if (parsed.data.targetAudience != null) updates.targetAudience = parsed.data.targetAudience;
    if (parsed.data.scheduledAt !== undefined) updates.scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
    if (parsed.data.budget !== undefined) updates.budget = parsed.data.budget ? String(parsed.data.budget) : null;
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
    await db.delete(campaignsTable)
      .where(and(eq(campaignsTable.id, req.params.id), eq(campaignsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting campaign");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/nps", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
    const responses = await db.select().from(npsResponsesTable)
      .where(eq(npsResponsesTable.tenantId, me.tenantId))
      .orderBy(desc(npsResponsesTable.createdAt));
    res.json(responses.map(r => ({
      id: r.id, tenantId: r.tenantId, clientId: r.clientId, tripId: r.tripId,
      score: r.score, feedback: r.feedback, category: r.category,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing NPS responses");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/nps", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateNpsResponseBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    if (parsed.data.clientId) {
      const [client] = await db.select().from(clientsTable)
        .where(and(eq(clientsTable.id, parsed.data.clientId), eq(clientsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!client) { res.status(400).json({ error: "Client not found or not in tenant" }); return; }
    }

    const id = generateId();
    await db.insert(npsResponsesTable).values({
      id,
      tenantId: me.tenantId,
      clientId: parsed.data.clientId ?? null,
      tripId: parsed.data.tripId ?? null,
      score: parsed.data.score,
      feedback: parsed.data.feedback ?? null,
      category: parsed.data.score >= 9 ? "promoter" : parsed.data.score >= 7 ? "passive" : "detractor",
    });
    const [nps] = await db.select().from(npsResponsesTable)
      .where(and(eq(npsResponsesTable.id, id), eq(npsResponsesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!nps) { res.status(500).json({ error: "Failed to create NPS response" }); return; }
    res.status(201).json({ id: nps.id, score: nps.score, category: nps.category });
  } catch (err) {
    req.log.error({ err }, "Error creating NPS response");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
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
    const parsed = CreateProductBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(productsTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      price: String(parsed.data.price),
      discountPrice: parsed.data.discountPrice ? String(parsed.data.discountPrice) : null,
      stock: parsed.data.stock ?? 0,
      images: parsed.data.images ?? [],
      tags: parsed.data.tags ?? [],
      createdById: me.id,
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
    const parsed = UpdateProductBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof productsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.price != null) updates.price = String(parsed.data.price);
    if (parsed.data.discountPrice !== undefined) updates.discountPrice = parsed.data.discountPrice ? String(parsed.data.discountPrice) : null;
    if (parsed.data.stock != null) updates.stock = parsed.data.stock;
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
    if (parsed.data.images != null) updates.images = parsed.data.images;
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
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
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
        id: i.id, productId: i.productId, quantity: i.quantity,
        unitPrice: Number(i.unitPrice), totalPrice: Number(i.totalPrice),
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

    if (parsed.data.clientId) {
      const [client] = await db.select().from(clientsTable)
        .where(and(eq(clientsTable.id, parsed.data.clientId), eq(clientsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!client) { res.status(400).json({ error: "Client not found or not in tenant" }); return; }
    }

    const id = generateId();
    let totalAmount = 0;
    const items = parsed.data.items ?? [];
    for (const item of items) {
      const [product] = await db.select().from(productsTable)
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!product) { res.status(400).json({ error: `Product ${item.productId} not found or not in tenant` }); return; }
      totalAmount += Number(product.discountPrice ?? product.price) * item.quantity;
    }

    await db.insert(ordersTable).values({
      id,
      tenantId: me.tenantId,
      clientId: parsed.data.clientId ?? null,
      status: "pending",
      totalAmount: String(totalAmount),
      paymentMethod: parsed.data.paymentMethod ?? null,
      paymentStatus: "pending",
      notes: parsed.data.notes ?? null,
      createdById: me.id,
    });

    for (const item of items) {
      const [product] = await db.select().from(productsTable)
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, me.tenantId)))
        .limit(1);
      const unitPrice = Number(product!.discountPrice ?? product!.price);
      await db.insert(orderItemsTable).values({
        id: generateId(),
        orderId: id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: String(unitPrice),
        totalPrice: String(unitPrice * item.quantity),
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
        id: i.id, productId: i.productId, quantity: i.quantity,
        unitPrice: Number(i.unitPrice), totalPrice: Number(i.totalPrice),
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
    const parsed = UpdateOrderBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof ordersTable.$inferInsert> = {};
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.paymentStatus != null) updates.paymentStatus = parsed.data.paymentStatus;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
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
