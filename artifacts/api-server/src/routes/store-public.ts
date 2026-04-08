import { Router } from "express";
import { db } from "@workspace/db";
import {
  storesTable,
  storeProductsTable,
  storeCategoriesTable,
  storeOrdersTable,
  storeOrderItemsTable,
  storeCouponsTable,
} from "@workspace/db";
import { eq, and, desc, asc, ilike, or } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";

const router = Router();

async function getActiveStore(slug: string) {
  const [store] = await db.select().from(storesTable)
    .where(and(
      eq(storesTable.slug, slug),
      eq(storesTable.isActive, true),
    )).limit(1);
  return store;
}

router.get("/public/store/:slug", async (req, res): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const publicData = {
      id: store.id,
      name: store.name,
      slug: store.slug,
      tagline: store.tagline,
      description: store.description,
      logo: store.logo,
      favicon: store.favicon,
      bannerHome: store.bannerHome,
      bannerMobile: store.bannerMobile,
      primaryColor: store.primaryColor,
      secondaryColor: store.secondaryColor,
      accentColor: store.accentColor,
      email: store.email,
      phone: store.phone,
      whatsapp: store.whatsapp,
      address: store.address,
      city: store.city,
      state: store.state,
      facebookUrl: store.facebookUrl,
      instagramUrl: store.instagramUrl,
      twitterUrl: store.twitterUrl,
      youtubeUrl: store.youtubeUrl,
      linkedinUrl: store.linkedinUrl,
      tiktokUrl: store.tiktokUrl,
      metaTitle: store.metaTitle,
      metaDescription: store.metaDescription,
      metaKeywords: store.metaKeywords,
      googleAnalyticsId: store.googleAnalyticsId,
      facebookPixelId: store.facebookPixelId,
      googleTagManagerId: store.googleTagManagerId,
      requireLogin: store.requireLogin,
      guestCheckout: store.guestCheckout,
      minInstallments: store.minInstallments,
      maxInstallments: store.maxInstallments,
      installmentFee: store.installmentFee,
      minOrderValue: store.minOrderValue,
      paymentMethods: store.paymentMethods,
      pixEnabled: store.pixEnabled,
      boletoEnabled: store.boletoEnabled,
      stripeEnabled: store.stripeEnabled,
      mpEnabled: store.mpEnabled,
      termsOfService: store.termsOfService,
      privacyPolicy: store.privacyPolicy,
      refundPolicy: store.refundPolicy,
      cancellationPolicy: store.cancellationPolicy,
      termsUrl: store.termsUrl,
      privacyUrl: store.privacyUrl,
      maintenanceMode: store.maintenanceMode,
      maintenanceMessage: store.maintenanceMessage,
    };
    await db.update(storesTable).set({ totalVisits: store.totalVisits + 1 })
      .where(eq(storesTable.id, store.id));
    res.json(publicData);
  } catch (err) {
    req.log.error({ err }, "Error getting public store");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/public/store/:slug/categories", async (req, res): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const categories = await db.select().from(storeCategoriesTable)
      .where(and(
        eq(storeCategoriesTable.storeId, store.id),
        eq(storeCategoriesTable.isActive, true),
      ))
      .orderBy(asc(storeCategoriesTable.order));
    res.json(categories);
  } catch (err) {
    req.log.error({ err }, "Error listing public store categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/public/store/:slug/products", async (req, res): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    if (store.maintenanceMode) {
      res.status(503).json({ error: "Store is under maintenance", message: store.maintenanceMessage });
      return;
    }
    const { category, type, featured, search, sort = "newest" } = req.query;
    const conditions = [
      eq(storeProductsTable.storeId, store.id),
      eq(storeProductsTable.status, "active"),
    ];
    if (category) conditions.push(eq(storeProductsTable.categoryId, category as string));
    if (type) conditions.push(eq(storeProductsTable.type, type as string));
    if (featured === "true") conditions.push(eq(storeProductsTable.isFeatured, true));
    if (search) {
      conditions.push(or(
        ilike(storeProductsTable.name, `%${search}%`),
        ilike(storeProductsTable.description, `%${search}%`),
      )!);
    }
    let orderBy;
    if (sort === "price_asc") orderBy = asc(storeProductsTable.price);
    else if (sort === "price_desc") orderBy = desc(storeProductsTable.price);
    else if (sort === "popular") orderBy = desc(storeProductsTable.salesCount);
    else orderBy = desc(storeProductsTable.publishedAt);
    const products = await db.select({
      id: storeProductsTable.id,
      type: storeProductsTable.type,
      name: storeProductsTable.name,
      slug: storeProductsTable.slug,
      shortDescription: storeProductsTable.shortDescription,
      categoryId: storeProductsTable.categoryId,
      price: storeProductsTable.price,
      comparePrice: storeProductsTable.comparePrice,
      onSale: storeProductsTable.onSale,
      salePrice: storeProductsTable.salePrice,
      saleStartsAt: storeProductsTable.saleStartsAt,
      saleEndsAt: storeProductsTable.saleEndsAt,
      images: storeProductsTable.images,
      thumbnail: storeProductsTable.thumbnail,
      hasDates: storeProductsTable.hasDates,
      startDate: storeProductsTable.startDate,
      endDate: storeProductsTable.endDate,
      destination: storeProductsTable.destination,
      durationDays: storeProductsTable.durationDays,
      isFeatured: storeProductsTable.isFeatured,
      ratingAverage: storeProductsTable.ratingAverage,
      ratingCount: storeProductsTable.ratingCount,
      trackInventory: storeProductsTable.trackInventory,
      stockQuantity: storeProductsTable.stockQuantity,
      publishedAt: storeProductsTable.publishedAt,
    }).from(storeProductsTable)
      .where(and(...conditions))
      .orderBy(orderBy);
    res.json(products);
  } catch (err) {
    req.log.error({ err }, "Error listing public store products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/public/store/:slug/products/:productSlug", async (req, res): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const [product] = await db.select().from(storeProductsTable)
      .where(and(
        eq(storeProductsTable.storeId, store.id),
        eq(storeProductsTable.slug, req.params.productSlug),
        eq(storeProductsTable.status, "active"),
      )).limit(1);
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }
    const { costPrice, ...publicProduct } = product;
    await db.update(storeProductsTable)
      .set({ viewsCount: product.viewsCount + 1 })
      .where(eq(storeProductsTable.id, product.id));
    res.json(publicProduct);
  } catch (err) {
    req.log.error({ err }, "Error getting public store product");
    res.status(500).json({ error: "Internal server error" });
  }
});

const CreateOrderBody = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(1),
  customerCpf: z.string().optional(),
  customerAddress: z.record(z.string(), z.unknown()).optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    variantData: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
  couponCode: z.string().optional(),
  paymentMethod: z.string().min(1),
  paymentProvider: z.string().min(1),
  customerNotes: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

router.post("/public/store/:slug/orders", async (req, res): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    if (store.maintenanceMode) {
      res.status(503).json({ error: "Store is under maintenance" });
      return;
    }
    const parsed = CreateOrderBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const data = parsed.data;
    let subtotal = 0;
    const orderItemsData: Array<{
      id: string;
      orderId: string;
      productId: string;
      productName: string;
      productType: string;
      productImage: string | null;
      variant: Record<string, unknown> | null;
      price: string;
      quantity: number;
      subtotal: string;
      discount: string;
      total: string;
      metadata: Record<string, unknown> | null;
    }> = [];
    for (const item of data.items) {
      const [product] = await db.select().from(storeProductsTable)
        .where(and(
          eq(storeProductsTable.id, item.productId),
          eq(storeProductsTable.storeId, store.id),
          eq(storeProductsTable.status, "active"),
        )).limit(1);
      if (!product) {
        res.status(400).json({ error: `Product ${item.productId} not found or unavailable` });
        return;
      }
      const price = parseFloat(product.onSale && product.salePrice ? product.salePrice : product.price);
      const lineTotal = price * item.quantity;
      subtotal += lineTotal;
      orderItemsData.push({
        id: generateId(),
        orderId: "",
        productId: product.id,
        productName: product.name,
        productType: product.type,
        productImage: product.thumbnail,
        variant: item.variantData || null,
        price: price.toFixed(2),
        quantity: item.quantity,
        subtotal: lineTotal.toFixed(2),
        discount: "0",
        total: lineTotal.toFixed(2),
        metadata: item.metadata || null,
      });
    }
    let discountAmount = 0;
    let couponId: string | undefined;
    if (data.couponCode) {
      const [coupon] = await db.select().from(storeCouponsTable)
        .where(and(
          eq(storeCouponsTable.storeId, store.id),
          eq(storeCouponsTable.code, data.couponCode),
          eq(storeCouponsTable.isActive, true),
        )).limit(1);
      if (coupon) {
        const now = new Date();
        if (coupon.startsAt <= now && coupon.expiresAt >= now) {
          if (!coupon.usageLimit || coupon.usageCount < coupon.usageLimit) {
            if (coupon.type === "percentage") {
              discountAmount = subtotal * (parseFloat(coupon.value) / 100);
            } else if (coupon.type === "fixed") {
              discountAmount = parseFloat(coupon.value);
            }
            if (coupon.maxDiscountAmount) {
              discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscountAmount));
            }
            couponId = coupon.id;
          }
        }
      }
    }
    const totalAmount = Math.max(0, subtotal - discountAmount);
    const orderId = generateId();
    const orderNumber = `#${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;
    await db.insert(storeOrdersTable).values({
      id: orderId,
      storeId: store.id,
      tenantId: store.tenantId,
      orderNumber,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      ...(data.customerCpf && { customerCpf: data.customerCpf }),
      ...(data.customerAddress && { customerAddress: data.customerAddress }),
      subtotal: subtotal.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      ...(couponId && { couponId }),
      ...(data.couponCode && { couponCode: data.couponCode }),
      paymentMethod: data.paymentMethod,
      paymentProvider: data.paymentProvider,
      ...(data.customerNotes && { customerNotes: data.customerNotes }),
      ...(data.ipAddress && { ipAddress: data.ipAddress }),
      ...(data.userAgent && { userAgent: data.userAgent }),
    });
    for (const itemData of orderItemsData) {
      itemData.orderId = orderId;
      await db.insert(storeOrderItemsTable).values(itemData);
    }
    if (couponId) {
      const [coupon] = await db.select().from(storeCouponsTable)
        .where(eq(storeCouponsTable.id, couponId)).limit(1);
      if (coupon) {
        await db.update(storeCouponsTable)
          .set({ usageCount: coupon.usageCount + 1 })
          .where(eq(storeCouponsTable.id, couponId));
      }
    }
    await db.update(storesTable).set({ totalOrders: store.totalOrders + 1 })
      .where(eq(storesTable.id, store.id));
    const [order] = await db.select().from(storeOrdersTable)
      .where(eq(storeOrdersTable.id, orderId)).limit(1);
    const items = await db.select().from(storeOrderItemsTable)
      .where(eq(storeOrderItemsTable.orderId, orderId));
    res.status(201).json({ ...order, items });
  } catch (err) {
    req.log.error({ err }, "Error creating store order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/public/store/:slug/orders/:orderNumber", async (req, res): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const [order] = await db.select({
      id: storeOrdersTable.id,
      orderNumber: storeOrdersTable.orderNumber,
      customerName: storeOrdersTable.customerName,
      customerEmail: storeOrdersTable.customerEmail,
      subtotal: storeOrdersTable.subtotal,
      discountAmount: storeOrdersTable.discountAmount,
      taxAmount: storeOrdersTable.taxAmount,
      shippingAmount: storeOrdersTable.shippingAmount,
      totalAmount: storeOrdersTable.totalAmount,
      couponCode: storeOrdersTable.couponCode,
      paymentMethod: storeOrdersTable.paymentMethod,
      paymentStatus: storeOrdersTable.paymentStatus,
      installments: storeOrdersTable.installments,
      pixQrCode: storeOrdersTable.pixQrCode,
      pixQrCodeUrl: storeOrdersTable.pixQrCodeUrl,
      pixCopyPaste: storeOrdersTable.pixCopyPaste,
      boletoUrl: storeOrdersTable.boletoUrl,
      boletoBarcode: storeOrdersTable.boletoBarcode,
      status: storeOrdersTable.status,
      fulfillmentStatus: storeOrdersTable.fulfillmentStatus,
      customerNotes: storeOrdersTable.customerNotes,
      paidAt: storeOrdersTable.paidAt,
      confirmedAt: storeOrdersTable.confirmedAt,
      completedAt: storeOrdersTable.completedAt,
      cancelledAt: storeOrdersTable.cancelledAt,
      createdAt: storeOrdersTable.createdAt,
    }).from(storeOrdersTable)
      .where(and(
        eq(storeOrdersTable.storeId, store.id),
        eq(storeOrdersTable.orderNumber, req.params.orderNumber),
      )).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    const items = await db.select({
      id: storeOrderItemsTable.id,
      productId: storeOrderItemsTable.productId,
      productName: storeOrderItemsTable.productName,
      productType: storeOrderItemsTable.productType,
      productImage: storeOrderItemsTable.productImage,
      variant: storeOrderItemsTable.variant,
      price: storeOrderItemsTable.price,
      quantity: storeOrderItemsTable.quantity,
      subtotal: storeOrderItemsTable.subtotal,
      total: storeOrderItemsTable.total,
    }).from(storeOrderItemsTable)
      .where(eq(storeOrderItemsTable.orderId, order.id));
    res.json({ ...order, items });
  } catch (err) {
    req.log.error({ err }, "Error getting public store order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/public/store/:slug/coupons/validate", async (req, res): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const parsed = z.object({
      code: z.string().min(1),
      cartTotal: z.number().positive(),
      items: z.array(z.object({ productId: z.string(), quantity: z.number().int() })).optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { code, cartTotal } = parsed.data;
    const [coupon] = await db.select().from(storeCouponsTable)
      .where(and(
        eq(storeCouponsTable.storeId, store.id),
        eq(storeCouponsTable.code, code),
        eq(storeCouponsTable.isActive, true),
      )).limit(1);
    if (!coupon) {
      res.status(400).json({ valid: false, error: "Cupom inválido" });
      return;
    }
    const now = new Date();
    if (coupon.startsAt > now) {
      res.status(400).json({ valid: false, error: "Cupom ainda não está vigente" });
      return;
    }
    if (coupon.expiresAt < now) {
      res.status(400).json({ valid: false, error: "Cupom expirado" });
      return;
    }
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      res.status(400).json({ valid: false, error: "Cupom esgotado" });
      return;
    }
    if (coupon.minPurchaseAmount && cartTotal < parseFloat(coupon.minPurchaseAmount)) {
      res.status(400).json({
        valid: false,
        error: `Valor mínimo para este cupom: R$ ${parseFloat(coupon.minPurchaseAmount).toFixed(2)}`,
      });
      return;
    }
    let discountAmount = 0;
    if (coupon.type === "percentage") {
      discountAmount = cartTotal * (parseFloat(coupon.value) / 100);
    } else if (coupon.type === "fixed") {
      discountAmount = parseFloat(coupon.value);
    }
    if (coupon.maxDiscountAmount) {
      discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscountAmount));
    }
    res.json({
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discountAmount: discountAmount.toFixed(2),
      description: coupon.description,
    });
  } catch (err) {
    req.log.error({ err }, "Error validating coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
