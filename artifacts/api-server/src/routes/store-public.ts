import { Router } from "express";
import { db } from "@workspace/db";
import {
  storesTable,
  storeProductsTable,
  storeCategoriesTable,
  storeOrdersTable,
  storeOrderItemsTable,
  storeCouponsTable,
  storeReviewsTable,
  reservationsTable,
  tripsTable,
  clientsTable,
  usersTable,
  referralsTable,
  referralTrackingTable,
  referralSettingsTable,
} from "@workspace/db";
import { eq, and, desc, asc, ilike, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId, generateVoucherCode } from "../lib/id";
import { randomBytes } from "crypto";

function generateCookieId(): string {
  return randomBytes(16).toString("hex");
}

function detectDeviceType(ua: string): string {
  if (/mobile/i.test(ua)) return "mobile";
  if (/tablet/i.test(ua)) return "tablet";
  return "desktop";
}
function detectBrowser(ua: string): string {
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "Unknown";
}
function detectOS(ua: string): string {
  if (/windows/i.test(ua)) return "Windows";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ios/i.test(ua)) return "iOS";
  if (/mac/i.test(ua)) return "MacOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Unknown";
}

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
    else if (sort === "rating") orderBy = desc(storeProductsTable.ratingAverage);
    else if (sort === "newest") orderBy = desc(storeProductsTable.publishedAt);
    else orderBy = desc(storeProductsTable.order);
    const selectFields = {
      id: storeProductsTable.id,
      type: storeProductsTable.type,
      name: storeProductsTable.name,
      slug: storeProductsTable.slug,
      shortDescription: storeProductsTable.shortDescription,
      categoryId: storeProductsTable.categoryId,
      tripId: storeProductsTable.tripId,
      includes: storeProductsTable.includes,
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
      availableSeats: tripsTable.availableSeats,
      totalCapacity: tripsTable.totalCapacity,
      departureDate: tripsTable.departureDate,
      inclusions: tripsTable.inclusions,
    };
    const whereClause = and(...conditions);
    const limit = limitStr ? Math.min(Number(limitStr) || 20, 200) : undefined;
    const page = limit ? Math.max(Number(pageStr) || 1, 1) : 1;
    const offset = limit ? (page - 1) * limit : 0;
    const [countResult, products] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(storeProductsTable).where(whereClause),
      limit
        ? db.select(selectFields).from(storeProductsTable)
            .leftJoin(tripsTable, eq(storeProductsTable.tripId, tripsTable.id))
            .where(whereClause).orderBy(orderBy).limit(limit).offset(offset)
        : db.select(selectFields).from(storeProductsTable)
            .leftJoin(tripsTable, eq(storeProductsTable.tripId, tripsTable.id))
            .where(whereClause).orderBy(orderBy),
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
    const [row] = await db.select({
      id: storeProductsTable.id,
      type: storeProductsTable.type,
      name: storeProductsTable.name,
      slug: storeProductsTable.slug,
      shortDescription: storeProductsTable.shortDescription,
      description: storeProductsTable.description,
      categoryId: storeProductsTable.categoryId,
      tripId: storeProductsTable.tripId,
      includes: storeProductsTable.includes,
      price: storeProductsTable.price,
      comparePrice: storeProductsTable.comparePrice,
      onSale: storeProductsTable.onSale,
      salePrice: storeProductsTable.salePrice,
      saleStartsAt: storeProductsTable.saleStartsAt,
      saleEndsAt: storeProductsTable.saleEndsAt,
      images: storeProductsTable.images,
      thumbnail: storeProductsTable.thumbnail,
      gallery: storeProductsTable.gallery,
      features: storeProductsTable.features,
      excludes: storeProductsTable.excludes,
      requirements: storeProductsTable.requirements,
      variants: storeProductsTable.variants,
      hasDates: storeProductsTable.hasDates,
      startDate: storeProductsTable.startDate,
      endDate: storeProductsTable.endDate,
      destination: storeProductsTable.destination,
      durationDays: storeProductsTable.durationDays,
      durationNights: storeProductsTable.durationNights,
      productCity: storeProductsTable.productCity,
      productState: storeProductsTable.productState,
      country: storeProductsTable.country,
      isFeatured: storeProductsTable.isFeatured,
      hasVariants: storeProductsTable.hasVariants,
      ratingAverage: storeProductsTable.ratingAverage,
      ratingCount: storeProductsTable.ratingCount,
      trackInventory: storeProductsTable.trackInventory,
      stockQuantity: storeProductsTable.stockQuantity,
      allowBackorder: storeProductsTable.allowBackorder,
      salesCount: storeProductsTable.salesCount,
      viewsCount: storeProductsTable.viewsCount,
      publishedAt: storeProductsTable.publishedAt,
      metaTitle: storeProductsTable.metaTitle,
      metaDescription: storeProductsTable.metaDescription,
      metaKeywords: storeProductsTable.metaKeywords,
      status: storeProductsTable.status,
      order: storeProductsTable.order,
      createdAt: storeProductsTable.createdAt,
      updatedAt: storeProductsTable.updatedAt,
      availableSeats: tripsTable.availableSeats,
      totalCapacity: tripsTable.totalCapacity,
      departureDate: tripsTable.departureDate,
      inclusions: tripsTable.inclusions,
    })
      .from(storeProductsTable)
      .leftJoin(tripsTable, eq(storeProductsTable.tripId, tripsTable.id))
      .where(and(
        eq(storeProductsTable.storeId, store.id),
        eq(storeProductsTable.slug, req.params.productSlug),
        eq(storeProductsTable.status, "active"),
      )).limit(1);
    if (!row) { res.status(404).json({ error: "Product not found" }); return; }
    await db.update(storeProductsTable)
      .set({ viewsCount: row.viewsCount + 1 })
      .where(eq(storeProductsTable.id, row.id));
    const reviews = await db.select().from(storeReviewsTable)
      .where(and(
        eq(storeReviewsTable.productId, row.id),
        eq(storeReviewsTable.status, "approved"),
      ))
      .orderBy(desc(storeReviewsTable.createdAt));
    res.json({ ...row, reviews });
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
  referralCode: z.string().optional(),
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

    // Phase 1: Aggregate quantities per product, validate products, preliminary stock check
    // Aggregate total requested quantity per productId (handles duplicate lines for same product)
    const quantityByProductId = new Map<string, number>();
    for (const item of data.items) {
      quantityByProductId.set(item.productId, (quantityByProductId.get(item.productId) ?? 0) + item.quantity);
    }

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
    // Map tripId -> { product, totalQty, totalValue } for products linked to a trip
    const tripLinkedProducts = new Map<string, { product: typeof storeProductsTable.$inferSelect; totalQty: number; totalValue: number }>();

    for (const item of data.items) {
      // Only fetch product once per unique productId
      if (!fetchedProducts.has(item.productId)) {
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
        // Preliminary stock check using AGGREGATED quantity across all lines (fast early rejection)
        if (product.trackInventory && !product.allowBackorder) {
          const totalRequested = quantityByProductId.get(product.id) ?? item.quantity;
          const available = product.stockQuantity ?? 0;
          if (available < totalRequested) {
            res.status(400).json({
              error: `Estoque insuficiente para "${product.name}". Disponível: ${available}`,
            });
            return;
          }
        }
        fetchedProducts.set(product.id, product);
      }
      const product = fetchedProducts.get(item.productId)!;
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

    // Build tripLinkedProducts AFTER the items loop, using already-aggregated quantityByProductId.
    // This prevents double-counting when the same productId appears on multiple lines of data.items.
    for (const [productId, product] of fetchedProducts) {
      if (!product.tripId) continue;
      const totalQty = quantityByProductId.get(productId) ?? 0;
      if (totalQty <= 0) continue;
      const productPrice = parseFloat(product.onSale && product.salePrice ? product.salePrice : product.price);
      const existing = tripLinkedProducts.get(product.tripId);
      if (existing) {
        existing.totalQty += totalQty;
        existing.totalValue += productPrice * totalQty;
      } else {
        tripLinkedProducts.set(product.tripId, {
          product,
          totalQty,
          totalValue: productPrice * totalQty,
        });
      }
    }

    // Phase 1.5: Preliminary trip seat availability check (fast early rejection)
    for (const [tripId, { product, totalQty }] of tripLinkedProducts) {
      const [trip] = await db.select({ availableSeats: tripsTable.availableSeats })
        .from(tripsTable)
        .where(and(eq(tripsTable.id, tripId), eq(tripsTable.tenantId, store.tenantId)))
        .limit(1);
      if (!trip) {
        res.status(400).json({ error: `Viagem vinculada ao produto "${product.name}" não encontrada` });
        return;
      }
      if (trip.availableSeats < totalQty) {
        res.status(400).json({
          error: `Sem vagas suficientes para "${product.name}". Disponível: ${trip.availableSeats} vaga(s)`,
        });
        return;
      }
    }

    // Phase 2: Coupon/referral handling (outside transaction)
    let discountAmount = 0;
    let couponId: string | undefined;
    let appliedReferralCode: string | undefined;
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
    // Referral code gives discount (only if no coupon discount already applied)
    let appliedReferralId: string | undefined;
    let appliedReferralReferrerId: string | undefined;
    let appliedReferralDiscountValue = 5;
    if (data.referralCode && !couponId) {
      const [referral] = await db.select({
        id: referralsTable.id,
        code: referralsTable.code,
        referrerId: referralsTable.referrerId,
        isActive: referralsTable.isActive,
        expiresAt: referralsTable.expiresAt,
        discountType: referralsTable.discountType,
        discountValue: referralsTable.discountValue,
      }).from(referralsTable)
        .where(and(
          eq(referralsTable.tenantId, store.tenantId),
          eq(referralsTable.code, data.referralCode.toUpperCase()),
          eq(referralsTable.status, "pending"),
        )).limit(1);
      if (referral && referral.isActive && !(referral.expiresAt && new Date() > referral.expiresAt)) {
        const discPct = referral.discountType === "percentage" ? Number(referral.discountValue) : 5;
        discountAmount = subtotal * (discPct / 100);
        appliedReferralCode = referral.code;
        appliedReferralId = referral.id;
        appliedReferralReferrerId = referral.referrerId;
        appliedReferralDiscountValue = discPct;
      }
    }

    const totalAmount = Math.max(0, subtotal - discountAmount);
    const orderId = generateId();
    const orderNumber = `#${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;

    // Phase 2.5: Find/create client and admin user for trip-linked reservation(s)
    let reservationClientId: string | null = null;
    let reservationCreatedById: string | null = null;
    if (tripLinkedProducts.size > 0) {
      // Find the first active user in the tenant (needed for reservation.createdById)
      const [adminUser] = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.tenantId, store.tenantId), eq(usersTable.isActive, true)))
        .limit(1);
      if (adminUser) {
        reservationCreatedById = adminUser.id;
        // Find existing client by email, or create a new one
        const [existingClient] = await db.select({ id: clientsTable.id })
          .from(clientsTable)
          .where(and(eq(clientsTable.tenantId, store.tenantId), eq(clientsTable.email, data.customerEmail)))
          .limit(1);
        if (existingClient) {
          reservationClientId = existingClient.id;
        } else {
          const newClientId = generateId();
          await db.insert(clientsTable).values({
            id: newClientId,
            tenantId: store.tenantId,
            name: data.customerName,
            email: data.customerEmail,
            whatsapp: data.customerPhone ?? "",
            createdById: adminUser.id,
          });
          reservationClientId = newClientId;
        }
      } else {
        res.status(500).json({ error: "Não foi possível criar a reserva: nenhum usuário ativo encontrado para esta agência" });
        return;
      }
    }

    // Phase 3: Atomic transaction — lock trips, lock products, validate, write everything
    try {
      await db.transaction(async (tx) => {
        // Lock trips FIRST (sorted by tripId) to prevent deadlocks with concurrent checkouts
        // and with the internal reservations route which also locks trips.
        const sortedTripIds = Array.from(tripLinkedProducts.keys()).sort();
        for (const tripId of sortedTripIds) {
          const { product, totalQty } = tripLinkedProducts.get(tripId)!;
          const lockResult = await tx.execute(
            sql`SELECT id, available_seats FROM trips WHERE id = ${tripId} AND tenant_id = ${store.tenantId} FOR UPDATE`
          );
          const row = (lockResult as unknown as { rows: Array<{ id: string; available_seats: number }> }).rows[0];
          if (!row) {
            const tripErr = new Error("trip_not_found");
            (tripErr as Error & Record<string, unknown>).productName = product.name;
            throw tripErr;
          }
          const currentSeats = Number(row.available_seats);
          if (currentSeats < totalQty) {
            const seatErr = new Error("no_seats");
            (seatErr as Error & Record<string, unknown>).productName = product.name;
            (seatErr as Error & Record<string, unknown>).available = currentSeats;
            throw seatErr;
          }
        }

        // Then lock products (sorted by productId for deadlock prevention)
        // Re-validate stock with row-level locks to prevent race conditions.
        const trackedProductIds = Array.from(fetchedProducts.values())
          .filter((p) => p.trackInventory && !p.allowBackorder)
          .map((p) => p.id)
          .sort();
        for (const productId of trackedProductIds) {
          const product = fetchedProducts.get(productId)!;
          const lockResult = await tx.execute(
            // Drizzle's tx.execute() returns raw node-postgres QueryResult; cast to access .rows
            sql`SELECT id, stock_quantity FROM store_products WHERE id = ${product.id} FOR UPDATE`
          );
          const row = (lockResult as unknown as { rows: Array<{ id: string; stock_quantity: number | null }> }).rows[0];
          const currentStock = Number(row?.stock_quantity ?? 0);
          const totalRequested = quantityByProductId.get(product.id) ?? 0;
          if (currentStock < totalRequested) {
            const stockErr = new Error("insufficient_stock");
            (stockErr as Error & Record<string, unknown>).productName = product.name;
            (stockErr as Error & Record<string, unknown>).available = currentStock;
            throw stockErr;
          }
        }

        // Insert order (persist clientId for CRM deal linkage on paid/completed transition)
        await tx.insert(storeOrdersTable).values({
          id: orderId,
          storeId: store.id,
          tenantId: store.tenantId,
          orderNumber,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone ?? "",
          ...(reservationClientId && { clientId: reservationClientId }),
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

        // Decrement stock and update salesCount — once per unique product using aggregated quantity
        const updatedProductIds = new Set<string>();
        for (const item of data.items) {
          const product = fetchedProducts.get(item.productId)!;
          if (updatedProductIds.has(product.id)) continue;
          updatedProductIds.add(product.id);
          const totalQty = quantityByProductId.get(product.id) ?? 0;
          if (product.trackInventory) {
            await tx.update(storeProductsTable).set({
              stockQuantity: sql`GREATEST(0, COALESCE(stock_quantity, 0) - ${totalQty})`,
              salesCount: sql`sales_count + ${totalQty}`,
            }).where(eq(storeProductsTable.id, product.id));
          } else {
            await tx.update(storeProductsTable).set({
              salesCount: sql`sales_count + ${totalQty}`,
            }).where(eq(storeProductsTable.id, product.id));
          }
        }

        // Create reservations for trip-linked products + decrement available_seats
        if (tripLinkedProducts.size > 0 && reservationClientId && reservationCreatedById) {
          for (const [tripId, { totalQty, totalValue }] of tripLinkedProducts) {
            const voucherCode = generateVoucherCode();
            const reservationId = generateId();
            // Use sequential placeholder seat IDs so cancellation logic can return the correct
            // number of seats to the trip (reservation cancel uses seats.length for the decrement).
            const placeholderSeats = Array.from({ length: totalQty }, (_, i) => String(i + 1));
            await tx.insert(reservationsTable).values({
              id: reservationId,
              tenantId: store.tenantId,
              tripId,
              clientId: reservationClientId,
              seats: placeholderSeats,
              totalValue: totalValue.toFixed(2),
              paidValue: "0",
              balance: totalValue.toFixed(2),
              status: "pending",
              voucherCode,
              qrCode: `QR-${voucherCode}`,
              storeOrderId: orderNumber,
              createdById: reservationCreatedById,
            });
            // Decrement trip available_seats and increment reserved_seats
            await tx.update(tripsTable).set({
              availableSeats: sql`available_seats - ${totalQty}`,
              reservedSeats: sql`reserved_seats + ${totalQty}`,
            }).where(and(eq(tripsTable.id, tripId), eq(tripsTable.tenantId, store.tenantId)));
          }
        }

        // Update coupon usage count atomically
        if (couponId) {
          await tx.update(storeCouponsTable)
            .set({ usageCount: sql`usage_count + 1` })
            .where(eq(storeCouponsTable.id, couponId));
        }

        // Mark referral as converted, update client stats, update reservation referral fields
        if (appliedReferralCode && appliedReferralId) {
          const discountAmountForReferral = discountAmount;
          // Get referral settings for bonus amount
          const [refSettings] = await tx.select({ bonusValue: referralSettingsTable.bonusValue, bonusType: referralSettingsTable.bonusType })
            .from(referralSettingsTable).where(eq(referralSettingsTable.tenantId, store.tenantId)).limit(1);
          const bonusValue = refSettings ? Number(refSettings.bonusValue) : 10;

          await tx.update(referralsTable)
            .set({
              status: "completed",
              convertedAt: new Date(),
              referredId: reservationClientId,
              referredEmail: data.customerEmail,
              referredName: data.customerName,
              discountApplied: true,
              discountAmount: discountAmountForReferral.toFixed(2),
              bonusAmount: bonusValue.toFixed(2),
              updatedAt: new Date(),
            })
            .where(and(
              eq(referralsTable.tenantId, store.tenantId),
              eq(referralsTable.code, appliedReferralCode),
              eq(referralsTable.status, "pending"),
            ));

          // Update referrer client stats
          if (appliedReferralReferrerId) {
            await tx.update(clientsTable)
              .set({
                successfulReferrals: sql`COALESCE(successful_referrals, 0) + 1`,
                referralEarnings: sql`COALESCE(referral_earnings, 0) + ${bonusValue.toFixed(2)}`,
              })
              .where(eq(clientsTable.id, appliedReferralReferrerId));
          }

          // Mark referral_tracking as converted if we have a cookie
          await tx.update(referralTrackingTable)
            .set({ converted: true, convertedAt: new Date(), updatedAt: new Date() })
            .where(eq(referralTrackingTable.referralCode, appliedReferralCode));
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
      if (txErr instanceof Error && txErr.message === "no_seats") {
        const e = txErr as Error & { productName?: string; available?: number };
        res.status(400).json({
          error: `Sem vagas suficientes para "${e.productName ?? ""}". Disponível: ${e.available ?? 0} vaga(s)`,
        });
        return;
      }
      if (txErr instanceof Error && txErr.message === "trip_not_found") {
        const e = txErr as Error & { productName?: string };
        res.status(400).json({
          error: `Viagem vinculada ao produto "${e.productName ?? ""}" não encontrada`,
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

router.post("/public/store/:slug/referral/validate", async (req, res): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const parsed = z.object({ code: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const code = parsed.data.code.toUpperCase();
    const [referral] = await db.select({
      id: referralsTable.id,
      code: referralsTable.code,
      referrerId: referralsTable.referrerId,
      referrerName: referralsTable.referrerName,
      status: referralsTable.status,
      isActive: referralsTable.isActive,
      expiresAt: referralsTable.expiresAt,
      discountValue: referralsTable.discountValue,
      discountType: referralsTable.discountType,
    }).from(referralsTable)
      .where(and(
        eq(referralsTable.tenantId, store.tenantId),
        eq(referralsTable.code, code),
        eq(referralsTable.status, "pending"),
      )).limit(1);
    if (!referral) {
      res.status(400).json({ valid: false, error: "Código de indicação inválido ou já utilizado" });
      return;
    }
    if (!referral.isActive) {
      res.status(400).json({ valid: false, error: "Código de indicação inativo" });
      return;
    }
    if (referral.expiresAt && new Date() > referral.expiresAt) {
      await db.update(referralsTable).set({ status: "expired", isActive: false })
        .where(eq(referralsTable.id, referral.id));
      res.status(400).json({ valid: false, error: "Código de indicação expirado" });
      return;
    }
    // Get referrer name from clients if not stored on referral
    let referrerName = referral.referrerName;
    if (!referrerName) {
      const [client] = await db.select({ name: clientsTable.name })
        .from(clientsTable).where(eq(clientsTable.id, referral.referrerId)).limit(1);
      referrerName = client?.name ?? "um amigo";
    }
    const discountPercent = referral.discountType === "percentage"
      ? Number(referral.discountValue)
      : 5;
    res.json({
      valid: true,
      code: referral.code,
      referrerName,
      discountPercent,
      discountType: referral.discountType,
      description: `Desconto de ${discountPercent}% por indicação de ${referrerName}`,
    });
  } catch (err) {
    req.log.error({ err }, "Error validating referral code");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/public/store/:slug/referral/info", async (req, res): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const code = (req.query.code as string | undefined)?.toUpperCase();
    if (!code) { res.status(400).json({ error: "code is required" }); return; }
    const [referral] = await db.select({
      id: referralsTable.id,
      code: referralsTable.code,
      referrerId: referralsTable.referrerId,
      referrerName: referralsTable.referrerName,
      isActive: referralsTable.isActive,
      expiresAt: referralsTable.expiresAt,
      discountValue: referralsTable.discountValue,
      discountType: referralsTable.discountType,
    }).from(referralsTable)
      .where(and(
        eq(referralsTable.tenantId, store.tenantId),
        eq(referralsTable.code, code),
        eq(referralsTable.status, "pending"),
      )).limit(1);
    if (!referral || !referral.isActive) {
      res.status(404).json({ error: "Referral not found" });
      return;
    }
    let referrerName = referral.referrerName;
    if (!referrerName) {
      const [client] = await db.select({ name: clientsTable.name })
        .from(clientsTable).where(eq(clientsTable.id, referral.referrerId)).limit(1);
      referrerName = client?.name ?? "um amigo";
    }
    const discountPercent = referral.discountType === "percentage"
      ? Number(referral.discountValue)
      : 5;
    res.json({
      code: referral.code,
      referrerName,
      discountPercent,
      discountType: referral.discountType,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting referral info");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/public/store/:slug/referral/track", async (req, res): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const parsed = z.object({
      code: z.string().min(1),
      cookieId: z.string().optional(),
      landingPage: z.string().optional(),
      utmSource: z.string().optional(),
      utmMedium: z.string().optional(),
      utmCampaign: z.string().optional(),
      utmContent: z.string().optional(),
      utmTerm: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const code = parsed.data.code.toUpperCase();
    const userAgent = req.headers["user-agent"] ?? "";
    const ipAddress = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket?.remoteAddress ?? "";

    // Generate or use provided cookie ID
    const cookieId = parsed.data.cookieId || generateCookieId();

    // Try to update existing tracking record
    const [existing] = await db.select({ id: referralTrackingTable.id, pagesVisited: referralTrackingTable.pagesVisited })
      .from(referralTrackingTable).where(eq(referralTrackingTable.cookieId, cookieId)).limit(1);

    if (existing) {
      const pages = Array.isArray(existing.pagesVisited) ? existing.pagesVisited : [];
      if (parsed.data.landingPage) pages.push(parsed.data.landingPage);
      await db.update(referralTrackingTable).set({
        lastVisit: new Date(),
        visitsCount: sql`visits_count + 1`,
        pagesVisited: pages as string[],
        updatedAt: new Date(),
      }).where(eq(referralTrackingTable.cookieId, cookieId));
    } else {
      await db.insert(referralTrackingTable).values({
        id: generateId(),
        tenantId: store.tenantId,
        cookieId,
        referralCode: code,
        ipAddress,
        userAgent,
        deviceType: detectDeviceType(userAgent),
        browser: detectBrowser(userAgent),
        os: detectOS(userAgent),
        pagesVisited: parsed.data.landingPage ? [parsed.data.landingPage] : [],
        utmSource: parsed.data.utmSource,
        utmMedium: parsed.data.utmMedium,
        utmCampaign: parsed.data.utmCampaign,
        utmContent: parsed.data.utmContent,
        utmTerm: parsed.data.utmTerm,
      });
    }

    // Update the referral record with tracking info (first visit)
    await db.update(referralsTable).set({
      cookieId,
      ipAddress,
      userAgent,
      landingPage: parsed.data.landingPage,
      utmSource: parsed.data.utmSource,
      utmMedium: parsed.data.utmMedium,
      utmCampaign: parsed.data.utmCampaign,
      firstVisit: sql`COALESCE(first_visit, now())`,
      lastVisit: new Date(),
      visitsCount: sql`visits_count + 1`,
      updatedAt: new Date(),
    }).where(and(
      eq(referralsTable.tenantId, store.tenantId),
      eq(referralsTable.code, code),
    ));

    res.json({ cookieId, tracked: true });
  } catch (err) {
    req.log.error({ err }, "Error tracking referral visit");
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

router.get("/public/store/:slug/reviews", async (req, res): Promise<void> => {
  try {
    const { slug } = req.params;
    const { limit: limitStr, featured } = req.query;
    const store = await db.query.storesTable.findFirst({ where: eq(storesTable.slug, slug as string) });
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const limit = limitStr ? Math.min(Number(limitStr), 50) : 20;
    const conditions = [
      eq(storeReviewsTable.storeId, store.id),
      eq(storeReviewsTable.status, "approved"),
    ];
    if (featured === "true") conditions.push(eq(storeReviewsTable.isFeatured, true));
    const reviews = await db.select().from(storeReviewsTable)
      .where(and(...conditions))
      .orderBy(desc(storeReviewsTable.createdAt))
      .limit(limit);
    res.json(reviews);
  } catch (err) {
    req.log.error({ err }, "Error listing public reviews");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
