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
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../lib/tenant";
import { generateId } from "../lib/id";

const router = Router();

const ADMIN_ROLES = ["agencia", "superadmin"];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

router.get("/store/settings", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.tenantId, me.tenantId))
      .limit(1);
    if (!store) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    res.json(store);
  } catch (err) {
    req.log.error({ err }, "Error fetching store settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

const StoreSettingsBody = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
  logoUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  contactWhatsapp: z.string().optional(),
  contactAddress: z.string().optional(),
  socialInstagram: z.string().optional(),
  socialFacebook: z.string().optional(),
  socialYoutube: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  customDomain: z.string().optional(),
  paymentMethods: z.array(z.string()).optional(),
  paymentSettings: z.record(z.string(), z.string()).optional(),
  shippingPolicy: z.string().optional(),
  returnPolicy: z.string().optional(),
  privacyPolicy: z.string().optional(),
  termsOfService: z.string().optional(),
  isActive: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().optional(),
  notifyNewOrders: z.boolean().optional(),
  notifyEmail: z.string().optional(),
});

router.put("/store/settings", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = StoreSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await db
      .update(storesTable)
      .set(parsed.data)
      .where(eq(storesTable.tenantId, me.tenantId));
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.tenantId, me.tenantId))
      .limit(1);
    res.json(store);
  } catch (err) {
    req.log.error({ err }, "Error updating store settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/store/init", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [existing] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.tenantId, me.tenantId))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "Store already exists", store: existing });
      return;
    }
    const InitBody = z.object({
      name: z.string().min(1),
      slug: z.string().min(1),
      contactEmail: z.string().email().optional(),
      contactWhatsapp: z.string().optional(),
      paymentMethods: z.array(z.string()).optional(),
    });
    const parsed = InitBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const id = generateId();
    await db.insert(storesTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      contactEmail: parsed.data.contactEmail,
      contactWhatsapp: parsed.data.contactWhatsapp,
      paymentMethods: parsed.data.paymentMethods ?? [],
    });
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, id))
      .limit(1);
    res.status(201).json(store);
  } catch (err) {
    req.log.error({ err }, "Error initializing store");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/store/categories", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const categories = await db
      .select()
      .from(storeCategoriesTable)
      .where(eq(storeCategoriesTable.tenantId, me.tenantId))
      .orderBy(storeCategoriesTable.position);
    res.json(categories);
  } catch (err) {
    req.log.error({ err }, "Error fetching categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

const CategoryBody = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  parentId: z.string().optional(),
  position: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.post("/store/categories", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.tenantId, me.tenantId))
      .limit(1);
    if (!store) {
      res.status(404).json({ error: "Store not found. Initialize store first." });
      return;
    }
    const parsed = CategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const id = generateId();
    const slug = parsed.data.slug || slugify(parsed.data.name);
    await db.insert(storeCategoriesTable).values({
      id,
      storeId: store.id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      imageUrl: parsed.data.imageUrl,
      parentId: parsed.data.parentId,
      position: parsed.data.position ?? 0,
      isActive: parsed.data.isActive ?? true,
    });
    const [cat] = await db
      .select()
      .from(storeCategoriesTable)
      .where(eq(storeCategoriesTable.id, id))
      .limit(1);
    res.status(201).json(cat);
  } catch (err) {
    req.log.error({ err }, "Error creating category");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/store/categories/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const UpdateCategoryBody = CategoryBody.partial();
    const parsed = UpdateCategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await db
      .update(storeCategoriesTable)
      .set(parsed.data)
      .where(
        and(
          eq(storeCategoriesTable.id, req.params.id),
          eq(storeCategoriesTable.tenantId, me.tenantId)
        )
      );
    const [cat] = await db
      .select()
      .from(storeCategoriesTable)
      .where(eq(storeCategoriesTable.id, req.params.id))
      .limit(1);
    if (!cat) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json(cat);
  } catch (err) {
    req.log.error({ err }, "Error updating category");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/store/categories/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db
      .delete(storeCategoriesTable)
      .where(
        and(
          eq(storeCategoriesTable.id, req.params.id),
          eq(storeCategoriesTable.tenantId, me.tenantId)
        )
      );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting category");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/store/products", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const products = await db
      .select()
      .from(storeProductsTable)
      .where(eq(storeProductsTable.tenantId, me.tenantId))
      .orderBy(desc(storeProductsTable.createdAt));
    res.json(products);
  } catch (err) {
    req.log.error({ err }, "Error fetching products");
    res.status(500).json({ error: "Internal server error" });
  }
});

const ProductBody = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  type: z.string().optional(),
  categoryId: z.string().optional(),
  tripId: z.string().optional(),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  price: z.number().optional(),
  salePrice: z.number().optional(),
  stock: z.number().int().optional(),
  images: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
  variants: z.array(z.any()).optional(),
  destination: z.string().optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  duration: z.number().int().optional(),
  status: z.string().optional(),
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

router.post("/store/products", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.tenantId, me.tenantId))
      .limit(1);
    if (!store) {
      res.status(404).json({ error: "Store not found. Initialize store first." });
      return;
    }
    const parsed = ProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const id = generateId();
    const slug = parsed.data.slug || slugify(parsed.data.name);
    await db.insert(storeProductsTable).values({
      id,
      storeId: store.id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      slug,
      type: parsed.data.type ?? "product",
      categoryId: parsed.data.categoryId,
      tripId: parsed.data.tripId,
      shortDescription: parsed.data.shortDescription,
      description: parsed.data.description,
      price: String(parsed.data.price ?? 0),
      salePrice: parsed.data.salePrice != null ? String(parsed.data.salePrice) : undefined,
      stock: parsed.data.stock,
      images: parsed.data.images ?? [],
      features: parsed.data.features ?? [],
      includes: parsed.data.includes ?? [],
      excludes: parsed.data.excludes ?? [],
      variants: parsed.data.variants ?? [],
      destination: parsed.data.destination,
      departureDate: parsed.data.departureDate,
      returnDate: parsed.data.returnDate,
      duration: parsed.data.duration,
      status: parsed.data.status ?? "draft",
      isPublished: parsed.data.isPublished ?? false,
      isFeatured: parsed.data.isFeatured ?? false,
      seoTitle: parsed.data.seoTitle,
      seoDescription: parsed.data.seoDescription,
    });
    const [product] = await db
      .select()
      .from(storeProductsTable)
      .where(eq(storeProductsTable.id, id))
      .limit(1);
    res.status(201).json(product);
  } catch (err) {
    req.log.error({ err }, "Error creating product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/store/products/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const UpdateProductBody = ProductBody.partial();
    const parsed = UpdateProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.price != null) updateData.price = String(parsed.data.price);
    if (parsed.data.salePrice != null) updateData.salePrice = String(parsed.data.salePrice);
    await db
      .update(storeProductsTable)
      .set(updateData)
      .where(
        and(
          eq(storeProductsTable.id, req.params.id),
          eq(storeProductsTable.tenantId, me.tenantId)
        )
      );
    const [product] = await db
      .select()
      .from(storeProductsTable)
      .where(eq(storeProductsTable.id, req.params.id))
      .limit(1);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
  } catch (err) {
    req.log.error({ err }, "Error updating product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/store/products/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db
      .delete(storeProductsTable)
      .where(
        and(
          eq(storeProductsTable.id, req.params.id),
          eq(storeProductsTable.tenantId, me.tenantId)
        )
      );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/store/orders", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const orders = await db
      .select()
      .from(storeOrdersTable)
      .where(eq(storeOrdersTable.tenantId, me.tenantId))
      .orderBy(desc(storeOrdersTable.createdAt));
    res.json(orders);
  } catch (err) {
    req.log.error({ err }, "Error fetching orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/store/orders/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [order] = await db
      .select()
      .from(storeOrdersTable)
      .where(
        and(
          eq(storeOrdersTable.id, req.params.id),
          eq(storeOrdersTable.tenantId, me.tenantId)
        )
      )
      .limit(1);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  } catch (err) {
    req.log.error({ err }, "Error fetching order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/store/orders/:id/status", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = z
      .object({ status: z.string(), paymentStatus: z.string().optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await db
      .update(storeOrdersTable)
      .set(parsed.data)
      .where(
        and(
          eq(storeOrdersTable.id, req.params.id),
          eq(storeOrdersTable.tenantId, me.tenantId)
        )
      );
    const [order] = await db
      .select()
      .from(storeOrdersTable)
      .where(eq(storeOrdersTable.id, req.params.id))
      .limit(1);
    res.json(order);
  } catch (err) {
    req.log.error({ err }, "Error updating order status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/store/coupons", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const coupons = await db
      .select()
      .from(storeCouponsTable)
      .where(eq(storeCouponsTable.tenantId, me.tenantId))
      .orderBy(desc(storeCouponsTable.createdAt));
    res.json(coupons);
  } catch (err) {
    req.log.error({ err }, "Error fetching coupons");
    res.status(500).json({ error: "Internal server error" });
  }
});

const CouponBody = z.object({
  code: z.string().min(1),
  type: z.enum(["percentage", "fixed"]),
  value: z.number(),
  minOrderValue: z.number().optional(),
  maxUses: z.number().int().optional(),
  applicableProductIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().optional(),
});

router.post("/store/coupons", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.tenantId, me.tenantId))
      .limit(1);
    if (!store) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    const parsed = CouponBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const id = generateId();
    await db.insert(storeCouponsTable).values({
      id,
      storeId: store.id,
      tenantId: me.tenantId,
      code: parsed.data.code.toUpperCase(),
      type: parsed.data.type,
      value: String(parsed.data.value),
      minOrderValue: parsed.data.minOrderValue != null ? String(parsed.data.minOrderValue) : undefined,
      maxUses: parsed.data.maxUses,
      applicableProductIds: parsed.data.applicableProductIds ?? [],
      isActive: parsed.data.isActive ?? true,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
    });
    const [coupon] = await db
      .select()
      .from(storeCouponsTable)
      .where(eq(storeCouponsTable.id, id))
      .limit(1);
    res.status(201).json(coupon);
  } catch (err) {
    req.log.error({ err }, "Error creating coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/store/coupons/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = CouponBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.value != null) updateData.value = String(parsed.data.value);
    if (parsed.data.minOrderValue != null) updateData.minOrderValue = String(parsed.data.minOrderValue);
    if (parsed.data.code) updateData.code = String(parsed.data.code).toUpperCase();
    if (parsed.data.expiresAt) updateData.expiresAt = new Date(parsed.data.expiresAt as string);
    await db
      .update(storeCouponsTable)
      .set(updateData)
      .where(
        and(
          eq(storeCouponsTable.id, req.params.id),
          eq(storeCouponsTable.tenantId, me.tenantId)
        )
      );
    const [coupon] = await db
      .select()
      .from(storeCouponsTable)
      .where(eq(storeCouponsTable.id, req.params.id))
      .limit(1);
    res.json(coupon);
  } catch (err) {
    req.log.error({ err }, "Error updating coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/store/coupons/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db
      .delete(storeCouponsTable)
      .where(
        and(
          eq(storeCouponsTable.id, req.params.id),
          eq(storeCouponsTable.tenantId, me.tenantId)
        )
      );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/store/reviews", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const reviews = await db
      .select()
      .from(storeReviewsTable)
      .where(eq(storeReviewsTable.tenantId, me.tenantId))
      .orderBy(desc(storeReviewsTable.createdAt));
    res.json(reviews);
  } catch (err) {
    req.log.error({ err }, "Error fetching reviews");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/store/reviews/:id/status", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = z
      .object({
        status: z.enum(["pending", "approved", "rejected"]),
        reply: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updateData: Record<string, unknown> = { status: parsed.data.status };
    if (parsed.data.reply) {
      updateData.reply = parsed.data.reply;
      updateData.replyAt = new Date();
    }
    await db
      .update(storeReviewsTable)
      .set(updateData)
      .where(
        and(
          eq(storeReviewsTable.id, req.params.id),
          eq(storeReviewsTable.tenantId, me.tenantId)
        )
      );
    const [review] = await db
      .select()
      .from(storeReviewsTable)
      .where(eq(storeReviewsTable.id, req.params.id))
      .limit(1);
    res.json(review);
  } catch (err) {
    req.log.error({ err }, "Error updating review");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
