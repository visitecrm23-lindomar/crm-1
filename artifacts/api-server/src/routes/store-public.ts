import { Router } from "express";
import {
  db,
  storesTable,
  storeCategoriesTable,
  storeProductsTable,
  storeOrdersTable,
  storeCouponsTable,
  storeReviewsTable,
} from "@workspace/db";
import { eq, and, ilike, lte, gte, desc, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";

const router = Router();

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

router.get("/public/store/:slug", async (req, res): Promise<void> => {
  try {
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.slug, req.params.slug))
      .limit(1);
    if (!store) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    if (!store.isActive) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    const safeStore = {
      id: store.id,
      name: store.name,
      slug: store.slug,
      description: store.description,
      logoUrl: store.logoUrl,
      bannerUrl: store.bannerUrl,
      primaryColor: store.primaryColor,
      secondaryColor: store.secondaryColor,
      accentColor: store.accentColor,
      contactEmail: store.contactEmail,
      contactPhone: store.contactPhone,
      contactWhatsapp: store.contactWhatsapp,
      contactAddress: store.contactAddress,
      socialInstagram: store.socialInstagram,
      socialFacebook: store.socialFacebook,
      socialYoutube: store.socialYoutube,
      seoTitle: store.seoTitle,
      seoDescription: store.seoDescription,
      paymentMethods: store.paymentMethods,
      shippingPolicy: store.shippingPolicy,
      returnPolicy: store.returnPolicy,
      privacyPolicy: store.privacyPolicy,
      termsOfService: store.termsOfService,
      maintenanceMode: store.maintenanceMode,
      maintenanceMessage: store.maintenanceMessage,
    };
    res.json(safeStore);
  } catch (err) {
    req.log.error({ err }, "Error fetching public store");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/public/store/:slug/categories", async (req, res): Promise<void> => {
  try {
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.slug, req.params.slug))
      .limit(1);
    if (!store || !store.isActive) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    const categories = await db
      .select()
      .from(storeCategoriesTable)
      .where(
        and(
          eq(storeCategoriesTable.storeId, store.id),
          eq(storeCategoriesTable.isActive, true)
        )
      )
      .orderBy(asc(storeCategoriesTable.position));
    res.json(categories);
  } catch (err) {
    req.log.error({ err }, "Error fetching public categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/public/store/:slug/products", async (req, res): Promise<void> => {
  try {
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.slug, req.params.slug))
      .limit(1);
    if (!store || !store.isActive) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    const allProducts = await db
      .select()
      .from(storeProductsTable)
      .where(
        and(
          eq(storeProductsTable.storeId, store.id),
          eq(storeProductsTable.isPublished, true)
        )
      )
      .orderBy(desc(storeProductsTable.isFeatured), asc(storeProductsTable.name));

    let filtered = allProducts;
    const { search, type, categoryId, featured, minPrice, maxPrice } = req.query;

    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          (p.destination ?? "").toLowerCase().includes(q)
      );
    }
    if (type && typeof type === "string") {
      filtered = filtered.filter((p) => p.type === type);
    }
    if (categoryId && typeof categoryId === "string") {
      filtered = filtered.filter((p) => p.categoryId === categoryId);
    }
    if (featured === "true") {
      filtered = filtered.filter((p) => p.isFeatured);
    }
    if (minPrice && typeof minPrice === "string") {
      const min = parseFloat(minPrice);
      filtered = filtered.filter((p) => Number(p.price) >= min);
    }
    if (maxPrice && typeof maxPrice === "string") {
      const max = parseFloat(maxPrice);
      filtered = filtered.filter((p) => Number(p.price) <= max);
    }

    const page = parseInt((req.query.page as string) ?? "1");
    const limit = parseInt((req.query.limit as string) ?? "12");
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    res.json({ data: paginated, total, page, limit });
  } catch (err) {
    req.log.error({ err }, "Error fetching public products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get(
  "/public/store/:slug/products/:productSlug",
  async (req, res): Promise<void> => {
    try {
      const [store] = await db
        .select()
        .from(storesTable)
        .where(eq(storesTable.slug, req.params.slug))
        .limit(1);
      if (!store || !store.isActive) {
        res.status(404).json({ error: "Store not found" });
        return;
      }
      const [product] = await db
        .select()
        .from(storeProductsTable)
        .where(
          and(
            eq(storeProductsTable.storeId, store.id),
            eq(storeProductsTable.slug, req.params.productSlug),
            eq(storeProductsTable.isPublished, true)
          )
        )
        .limit(1);
      if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
      }
      const reviews = await db
        .select()
        .from(storeReviewsTable)
        .where(
          and(
            eq(storeReviewsTable.productId, product.id),
            eq(storeReviewsTable.status, "approved")
          )
        )
        .orderBy(desc(storeReviewsTable.createdAt))
        .limit(20);
      res.json({ ...product, reviews });
    } catch (err) {
      req.log.error({ err }, "Error fetching public product");
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

const CreateOrderBody = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  customerCpf: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string(),
      productName: z.string(),
      quantity: z.number().int().min(1),
      unitPrice: z.number(),
      variantLabel: z.string().optional(),
    })
  ),
  couponCode: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/public/store/:slug/orders", async (req, res): Promise<void> => {
  try {
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.slug, req.params.slug))
      .limit(1);
    if (!store || !store.isActive) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    if (store.maintenanceMode) {
      res.status(503).json({ error: "Store is in maintenance mode" });
      return;
    }
    const parsed = CreateOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const subtotal = parsed.data.items.reduce(
      (acc, item) => acc + item.unitPrice * item.quantity,
      0
    );
    let discountAmount = 0;
    let couponUsed: string | undefined;

    if (parsed.data.couponCode) {
      const [coupon] = await db
        .select()
        .from(storeCouponsTable)
        .where(
          and(
            eq(storeCouponsTable.storeId, store.id),
            eq(storeCouponsTable.code, parsed.data.couponCode.toUpperCase()),
            eq(storeCouponsTable.isActive, true)
          )
        )
        .limit(1);
      if (coupon) {
        const now = new Date();
        const expired = coupon.expiresAt && coupon.expiresAt < now;
        const exhausted = coupon.maxUses != null && coupon.usedCount >= coupon.maxUses;
        const belowMin = coupon.minOrderValue != null && subtotal < Number(coupon.minOrderValue);
        if (!expired && !exhausted && !belowMin) {
          if (coupon.type === "percentage") {
            discountAmount = (subtotal * Number(coupon.value)) / 100;
          } else {
            discountAmount = Math.min(Number(coupon.value), subtotal);
          }
          couponUsed = coupon.code;
          await db
            .update(storeCouponsTable)
            .set({ usedCount: coupon.usedCount + 1 })
            .where(eq(storeCouponsTable.id, coupon.id));
        }
      }
    }

    const totalAmount = Math.max(0, subtotal - discountAmount);
    const id = generateId();
    const orderNumber = generateOrderNumber();

    await db.insert(storeOrdersTable).values({
      id,
      storeId: store.id,
      tenantId: store.tenantId,
      orderNumber,
      status: "pending",
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone,
      customerCpf: parsed.data.customerCpf,
      items: parsed.data.items,
      subtotal: String(subtotal),
      discountAmount: String(discountAmount),
      couponCode: couponUsed,
      totalAmount: String(totalAmount),
      paymentMethod: parsed.data.paymentMethod,
      paymentStatus: "pending",
      notes: parsed.data.notes,
    });

    const [order] = await db
      .select()
      .from(storeOrdersTable)
      .where(eq(storeOrdersTable.id, id))
      .limit(1);
    res.status(201).json(order);
  } catch (err) {
    req.log.error({ err }, "Error creating public order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get(
  "/public/store/:slug/orders/:orderNumber",
  async (req, res): Promise<void> => {
    try {
      const [store] = await db
        .select()
        .from(storesTable)
        .where(eq(storesTable.slug, req.params.slug))
        .limit(1);
      if (!store) {
        res.status(404).json({ error: "Store not found" });
        return;
      }
      const [order] = await db
        .select()
        .from(storeOrdersTable)
        .where(
          and(
            eq(storeOrdersTable.storeId, store.id),
            eq(storeOrdersTable.orderNumber, req.params.orderNumber)
          )
        )
        .limit(1);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      res.json(order);
    } catch (err) {
      req.log.error({ err }, "Error fetching public order");
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/public/store/:slug/coupons/validate",
  async (req, res): Promise<void> => {
    try {
      const [store] = await db
        .select()
        .from(storesTable)
        .where(eq(storesTable.slug, req.params.slug))
        .limit(1);
      if (!store || !store.isActive) {
        res.status(404).json({ error: "Store not found" });
        return;
      }
      const parsed = z
        .object({ code: z.string(), orderTotal: z.number() })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const [coupon] = await db
        .select()
        .from(storeCouponsTable)
        .where(
          and(
            eq(storeCouponsTable.storeId, store.id),
            eq(storeCouponsTable.code, parsed.data.code.toUpperCase()),
            eq(storeCouponsTable.isActive, true)
          )
        )
        .limit(1);
      if (!coupon) {
        res.status(404).json({ valid: false, error: "Cupom não encontrado" });
        return;
      }
      const now = new Date();
      if (coupon.expiresAt && coupon.expiresAt < now) {
        res.json({ valid: false, error: "Cupom expirado" });
        return;
      }
      if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
        res.json({ valid: false, error: "Cupom esgotado" });
        return;
      }
      if (coupon.minOrderValue != null && parsed.data.orderTotal < Number(coupon.minOrderValue)) {
        res.json({
          valid: false,
          error: `Pedido mínimo de R$ ${Number(coupon.minOrderValue).toFixed(2)}`,
        });
        return;
      }
      let discountAmount = 0;
      if (coupon.type === "percentage") {
        discountAmount = (parsed.data.orderTotal * Number(coupon.value)) / 100;
      } else {
        discountAmount = Math.min(Number(coupon.value), parsed.data.orderTotal);
      }
      res.json({
        valid: true,
        code: coupon.code,
        type: coupon.type,
        value: Number(coupon.value),
        discountAmount: Math.round(discountAmount * 100) / 100,
      });
    } catch (err) {
      req.log.error({ err }, "Error validating coupon");
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/public/store/:slug/reviews",
  async (req, res): Promise<void> => {
    try {
      const [store] = await db
        .select()
        .from(storesTable)
        .where(eq(storesTable.slug, req.params.slug))
        .limit(1);
      if (!store || !store.isActive) {
        res.status(404).json({ error: "Store not found" });
        return;
      }
      const parsed = z
        .object({
          productId: z.string(),
          customerName: z.string().min(1),
          customerEmail: z.string().email().optional(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const id = generateId();
      await db.insert(storeReviewsTable).values({
        id,
        storeId: store.id,
        tenantId: store.tenantId,
        productId: parsed.data.productId,
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
        status: "pending",
      });
      res.status(201).json({ success: true, message: "Avaliação enviada para moderação" });
    } catch (err) {
      req.log.error({ err }, "Error submitting review");
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
