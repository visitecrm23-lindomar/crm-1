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
import { eq, and, desc, asc, ilike, or, sql } from "drizzle-orm";
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
    const {
      category, categoryId, type, featured, search, sort = "newest",
      destination, minPrice, maxPrice,
      page: pageStr, limit: limitStr,
    } = req.query;
    const conditions = [
      eq(storeProductsTable.storeId, store.id),
      eq(storeProductsTable.status, "active"),
    ];
    const categoryFilter = (categoryId ?? category) as string | undefined;
    if (categoryFilter) conditions.push(eq(storeProductsTable.categoryId, categoryFilter));
    if (type) conditions.push(eq(storeProductsTable.type, type as string));
    if (featured === "true") conditions.push(eq(storeProductsTable.isFeatured, true));
    if (search) {
      conditions.push(or(
        ilike(storeProductsTable.name, `%${search}%`),
        ilike(storeProductsTable.description, `%${search}%`),
      )!);
    }
    if (destination && destination !== "all") {
      conditions.push(eq(storeProductsTable.destination, destination as string));
    }
    const minPriceNum = minPrice ? Number(minPrice) : NaN;
    const maxPriceNum = maxPrice ? Number(maxPrice) : NaN;
    if (!isNaN(minPriceNum) && isFinite(minPriceNum)) conditions.push(sql`CAST(${storeProductsTable.price} AS NUMERIC) >= ${minPriceNum}`);
    if (!isNaN(maxPriceNum) && isFinite(maxPriceNum)) conditions.push(sql`CAST(${storeProductsTable.price} AS NUMERIC) <= ${maxPriceNum}`);
    let orderBy;
    if (sort === "price_asc") orderBy = asc(storeProductsTable.price);
    else if (sort === "price_desc") orderBy = desc(storeProductsTable.price);
    else if (sort === "popular") orderBy = desc(storeProductsTable.salesCount);
    else orderBy = desc(storeProductsTable.publishedAt);
    const selectFields = {
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
    };
    const whereClause = and(...conditions);
    const limit = limitStr ? Math.min(Number(limitStr) || 20, 200) : undefined;
    const page = limit ? Math.max(Number(pageStr) || 1, 1) : 1;
    const offset = limit ? (page - 1) * limit : 0;
    const [countResult, products] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(storeProductsTable).where(whereClause),
      limit
        ? db.select(selectFields).from(storeProductsTable).where(whereClause).orderBy(orderBy).limit(limit).offset(offset)
        : db.select(selectFields).from(storeProductsTable).where(whereClause).orderBy(orderBy),
    ]);
    res.json({ data: products, total: Number(countResult[0]?.count ?? 0), page, limit: limit ?? products.length });
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
  customerPhone: z.string().optional(),
  customerCpf: z.string().optional(),
  customerAddress: z.record(z.string(), z.unknown()).optional(),
  items: z.array(z.object({
    productId: z.string(),
    productName: z.string().optional(),
    quantity: z.number().int().min(1),
    unitPrice: z.number().nonnegative().optional(),
    variantLabel: z.string().optional(),
    variantData: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
  couponCode: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentProvider: z.string().optional(),
  notes: z.string().optional(),
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

    // Phase 1: Validate products, preliminary stock check, build order items
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
    const fetchedProducts = new Map<string, typeof storeProductsTable.$inferSelect>();

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
      // Preliminary stock check (fast early rejection; re-validated atomically below)
      if (product.trackInventory && !product.allowBackorder) {
        const available = product.stockQuantity ?? 0;
        if (available < item.quantity) {
          res.status(400).json({
            error: `Estoque insuficiente para "${product.name}". Disponível: ${available}`,
          });
          return;
        }
      }
      fetchedProducts.set(product.id, product);
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
        variant: item.variantData || (item.variantLabel ? { label: item.variantLabel } : null),
        price: price.toFixed(2),
        quantity: item.quantity,
        subtotal: lineTotal.toFixed(2),
        discount: "0",
        total: lineTotal.toFixed(2),
        metadata: item.metadata || null,
      });
    }

    // Phase 2: Coupon handling (outside transaction)
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

    // Phase 3: Atomic transaction — lock products, validate stock, write everything
    try {
      await db.transaction(async (tx) => {
        // Re-validate stock with row-level locks to prevent race conditions
        for (const item of data.items) {
          const product = fetchedProducts.get(item.productId)!;
          if (product.trackInventory && !product.allowBackorder) {
            const lockResult = await tx.execute(
              // Drizzle's tx.execute() returns raw node-postgres QueryResult; cast to access .rows
              sql`SELECT id, stock_quantity FROM store_products WHERE id = ${product.id} FOR UPDATE`
            );
            const row = (lockResult as unknown as { rows: Array<{ id: string; stock_quantity: number | null }> }).rows[0];
            const currentStock = Number(row?.stock_quantity ?? 0);
            if (currentStock < item.quantity) {
              const stockErr = new Error("insufficient_stock");
              (stockErr as Error & Record<string, unknown>).productName = product.name;
              (stockErr as Error & Record<string, unknown>).available = currentStock;
              throw stockErr;
            }
          }
        }

        // Insert order
        await tx.insert(storeOrdersTable).values({
          id: orderId,
          storeId: store.id,
          tenantId: store.tenantId,
          orderNumber,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone ?? "",
          ...(data.customerCpf && { customerCpf: data.customerCpf }),
          ...(data.customerAddress && { customerAddress: data.customerAddress }),
          subtotal: subtotal.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          ...(couponId && { couponId }),
          ...(data.couponCode && { couponCode: data.couponCode }),
          paymentMethod: data.paymentMethod ?? "pending",
          paymentProvider: data.paymentProvider ?? "manual",
          ...(data.customerNotes && { customerNotes: data.customerNotes }),
          ...((data.notes && !data.customerNotes) && { customerNotes: data.notes }),
          ...(data.ipAddress && { ipAddress: data.ipAddress }),
          ...(data.userAgent && { userAgent: data.userAgent }),
        });

        // Insert order items
        for (const itemData of orderItemsData) {
          itemData.orderId = orderId;
          await tx.insert(storeOrderItemsTable).values(itemData);
        }

        // Decrement stock and update salesCount for each product
        for (const item of data.items) {
          const product = fetchedProducts.get(item.productId)!;
          if (product.trackInventory) {
            await tx.update(storeProductsTable).set({
              stockQuantity: sql`GREATEST(0, COALESCE(stock_quantity, 0) - ${item.quantity})`,
              salesCount: sql`sales_count + ${item.quantity}`,
            }).where(eq(storeProductsTable.id, product.id));
          } else {
            await tx.update(storeProductsTable).set({
              salesCount: sql`sales_count + ${item.quantity}`,
            }).where(eq(storeProductsTable.id, product.id));
          }
        }

        // Update coupon usage count atomically
        if (couponId) {
          await tx.update(storeCouponsTable)
            .set({ usageCount: sql`usage_count + 1` })
            .where(eq(storeCouponsTable.id, couponId));
        }

        // Update store order count atomically
        await tx.update(storesTable)
          .set({ totalOrders: sql`total_orders + 1` })
          .where(eq(storesTable.id, store.id));
      });
    } catch (txErr: unknown) {
      if (txErr instanceof Error && txErr.message === "insufficient_stock") {
        const e = txErr as Error & { productName?: string; available?: number };
        res.status(400).json({
          error: `Estoque insuficiente para "${e.productName}". Disponível: ${e.available ?? 0}`,
        });
        return;
      }
      throw txErr;
    }

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
    const rawItems = await db.select({
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
    const items = rawItems.map((item) => {
      const variantObj = item.variant as Record<string, string> | null;
      const variantLabel = variantObj
        ? Object.values(variantObj).join(" / ")
        : null;
      return {
        ...item,
        unitPrice: parseFloat(item.price ?? "0"),
        variantLabel,
      };
    });
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
      cartTotal: z.number().nonnegative().optional(),
      orderTotal: z.number().nonnegative().optional(),
      items: z.array(z.object({ productId: z.string(), quantity: z.number().int() })).optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { code } = parsed.data;
    const cartTotal = parsed.data.cartTotal ?? parsed.data.orderTotal ?? 0;
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
      discountAmount: Math.round(discountAmount * 100) / 100,
      description: coupon.description,
    });
  } catch (err) {
    req.log.error({ err }, "Error validating coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
