import { Router, type NextFunction } from "express";
import { db } from "@workspace/db";
import { addSeatClient, removeSeatClient, emitSeatUpdate } from "../lib/seat-sse";
import { broadcastSeatUpdate } from "../lib/realtime";
import { AppError, NotFoundError, ValidationError, ConflictError } from "../lib/errors";
import { normalizeOrderEmail, roundMoney } from "../lib/pricing";
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
  pipelineStagesTable,
  dealsTable,
} from "@workspace/db";
import { eq, and, desc, asc, ilike, or, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId, generateVoucherCode, generateReferralCode } from "../lib/id";
import { getTenantReservationPrefix, tripTypeToCode, getYearMonth, nextReservationSequence, buildReservationNumber } from "../lib/reservation-number";
import { randomBytes } from "crypto";
import { clerkClient } from "@clerk/express";
import { enqueueReservationConfirmationEmail, sendWelcomeEmail } from "../queues/email-helpers";
import { writeClientActivity } from "../lib/activities";

function generateCookieId(): string {
  return randomBytes(16).toString("hex");
}

function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$!";
  const all = upper + lower + digits + special;
  const bytes = randomBytes(16);
  let pwd = upper[bytes[0] % upper.length]
    + lower[bytes[1] % lower.length]
    + digits[bytes[2] % digits.length]
    + special[bytes[3] % special.length];
  for (let i = 4; i < 12; i++) {
    pwd += all[bytes[i] % all.length];
  }
  const arr = pwd.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
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

router.get("/public/store/:slug", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }
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
      paymentMethods: Array.isArray(store.paymentMethods) ? store.paymentMethods : [],
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
    next(err);
  }
});

router.get("/public/store/:slug/categories", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }
    const categories = await db.select().from(storeCategoriesTable)
      .where(and(
        eq(storeCategoriesTable.storeId, store.id),
        eq(storeCategoriesTable.isActive, true),
      ))
      .orderBy(asc(storeCategoriesTable.order));
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

router.get("/public/store/:slug/products", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }
    if (store.maintenanceMode) {
      next(new AppError("Store is under maintenance", 503, "STORE_MAINTENANCE", { maintenanceMessage: store.maintenanceMessage }));
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
      returnDate: tripsTable.returnDate,
      inclusions: tripsTable.inclusions,
      tripType: tripsTable.type,
      originCity: tripsTable.originCity,
      originState: tripsTable.originState,
      departureTime: tripsTable.departureTime,
      returnTime: tripsTable.returnTime,
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
    const processedProducts = products.map(p => ({
      ...p,
      departureDate: p.departureDate
        ? (p.departureDate as unknown as Date).toISOString().slice(0, 10)
        : null,
      returnDate: p.returnDate
        ? (p.returnDate as unknown as Date).toISOString().slice(0, 10)
        : null,
    }));
    res.json({ data: processedProducts, total: Number(countResult[0]?.count ?? 0), page, limit: limit ?? processedProducts.length });
  } catch (err) {
    next(err);
  }
});

router.get("/public/store/:slug/products/:productSlug", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }
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
      returnDate: tripsTable.returnDate,
      inclusions: tripsTable.inclusions,
      tripType: tripsTable.type,
      originCity: tripsTable.originCity,
      originState: tripsTable.originState,
      departureTime: tripsTable.departureTime,
      returnTime: tripsTable.returnTime,
    })
      .from(storeProductsTable)
      .leftJoin(tripsTable, eq(storeProductsTable.tripId, tripsTable.id))
      .where(and(
        eq(storeProductsTable.storeId, store.id),
        eq(storeProductsTable.slug, req.params.productSlug),
        eq(storeProductsTable.status, "active"),
      )).limit(1);
    if (!row) { next(new NotFoundError("Product not found", "NOT_FOUND")); return; }
    await db.update(storeProductsTable)
      .set({ viewsCount: row.viewsCount + 1 })
      .where(eq(storeProductsTable.id, row.id));
    const reviews = await db.select().from(storeReviewsTable)
      .where(and(
        eq(storeReviewsTable.productId, row.id),
        eq(storeReviewsTable.status, "approved"),
      ))
      .orderBy(desc(storeReviewsTable.createdAt));
    res.json({
      ...row,
      departureDate: row.departureDate
        ? (row.departureDate as unknown as Date).toISOString().slice(0, 10)
        : null,
      returnDate: row.returnDate
        ? (row.returnDate as unknown as Date).toISOString().slice(0, 10)
        : null,
      reviews,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/public/store/:slug/trips/:tripId/seat-map", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }

    const [trip] = await db.select({
      id: tripsTable.id,
      seatMap: tripsTable.seatMap,
      seatLayout: tripsTable.seatLayout,
      totalCapacity: tripsTable.totalCapacity,
      tenantId: tripsTable.tenantId,
    }).from(tripsTable)
      .where(and(
        eq(tripsTable.id, req.params.tripId),
        eq(tripsTable.tenantId, store.tenantId),
      )).limit(1);

    if (!trip) { next(new NotFoundError("Trip not found", "NOT_FOUND")); return; }

    const ACTIVE_STATUSES = ["pending", "confirmed"] as const;
    const reservations = await db.select({ seats: reservationsTable.seats, status: reservationsTable.status })
      .from(reservationsTable)
      .where(and(
        eq(reservationsTable.tripId, trip.id),
        eq(reservationsTable.tenantId, store.tenantId),
        inArray(reservationsTable.status, [...ACTIVE_STATUSES]),
      ));

    const occupiedSeats: Record<string, string> = {};
    for (const r of reservations) {
      const seatStatus = r.status === "confirmed" ? "confirmed" : "reserved";
      for (const seat of r.seats) occupiedSeats[seat] = seatStatus;
    }

    const seatMap = trip.seatMap as Record<string, { row: number; col: number; floor?: number; status: string; type?: string }>;
    const seats = Object.entries(seatMap).map(([num, data]) => ({
      number: num,
      row: data.row,
      col: data.col,
      floor: data.floor ?? 1,
      type: data.type ?? "seat",
      status: occupiedSeats[num]
        ?? (data.type && !["seat", "vip", "accessible"].includes(data.type) ? data.type : "available"),
    }));

    const maxCol = Math.max(...seats.map(s => s.col), 4);
    const maxFloor = Math.max(...seats.map(s => s.floor ?? 1), 1);
    res.json({
      tripId: trip.id,
      layout: trip.seatLayout ?? "2x2",
      floors: maxFloor,
      totalSeats: trip.totalCapacity,
      cols: maxCol,
      seats,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/public/store/:slug/trips/:tripId/seats/stream", async (req, res, next: NextFunction): Promise<void> => {
  const store = await getActiveStore(req.params.slug).catch(() => null);
  if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }

  const [trip] = await db.select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(
      eq(tripsTable.id, req.params.tripId),
      eq(tripsTable.tenantId, store.tenantId),
    ))
    .limit(1);
  if (!trip) { next(new NotFoundError("Trip not found", "NOT_FOUND")); return; }

  const tripId = trip.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  addSeatClient(tripId, res);
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(ping); }
  }, 30000);
  req.on("close", () => {
    clearInterval(ping);
    removeSeatClient(tripId, res);
  });
});

const CreateOrderBody = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  customerCpf: z.string().optional(),
  customerBirthdate: z.string().optional(),
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
  referralCookieId: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentProvider: z.string().optional(),
  notes: z.string().optional(),
  customerNotes: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  seats: z.array(z.string()).optional(),
});

router.post("/public/store/:slug/orders", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }
    if (store.maintenanceMode) {
      next(new AppError("Store is under maintenance", 503, "SERVICE_UNAVAILABLE"));
      return;
    }
    const parsed = CreateOrderBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }
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
          next(new ValidationError(`Product ${item.productId} not found or unavailable`, "VALIDATION_ERROR"));
          return;
        }
        // Preliminary stock check using AGGREGATED quantity across all lines (fast early rejection)
        if (product.trackInventory && !product.allowBackorder) {
          const totalRequested = quantityByProductId.get(product.id) ?? item.quantity;
          const available = product.stockQuantity ?? 0;
          if (available < totalRequested) {
            next(new ConflictError(`Estoque insuficiente para "${product.name}". Disponível: ${available}`, "INSUFFICIENT_STOCK")); return;
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
        next(new ValidationError(`Viagem vinculada ao produto "${product.name}" não encontrada`, "TRIP_NOT_FOUND")); return;
      }
      if (trip.availableSeats < totalQty) {
        next(new ConflictError(`Sem vagas suficientes para "${product.name}". Disponível: ${trip.availableSeats} vaga(s)`, "INSUFFICIENT_SEATS")); return;
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
        if (coupon.startsAt > now || coupon.expiresAt < now) {
          next(new ValidationError("Este cupom está expirado", "COUPON_EXPIRED")); return;
        }
        if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
          next(new ValidationError("Este cupom atingiu o limite de uso", "COUPON_USAGE_LIMIT_EXCEEDED")); return;
        }
        if (coupon.type === "percentage") {
          discountAmount = roundMoney(subtotal * (Number(coupon.value) / 100));
        } else if (coupon.type === "fixed") {
          discountAmount = roundMoney(Number(coupon.value));
        }
        if (coupon.maxDiscountAmount) {
          discountAmount = Math.min(discountAmount, roundMoney(Number(coupon.maxDiscountAmount)));
        }
        couponId = coupon.id;
      }
    }
    // Referral code gives discount (only if no coupon discount already applied)
    let appliedReferralReferrerId: string | undefined;
    let appliedReferralDiscountValue = 5;
    let appliedReferralDiscountType = "percentage";
    if (data.referralCode && !couponId) {
      const upperCode = data.referralCode.toUpperCase();
      // Look up referrer by permanent client referral code
      const [referrer] = await db.select({
        id: clientsTable.id,
        name: clientsTable.name,
        email: clientsTable.email,
        referralCodeGeneratedAt: clientsTable.referralCodeGeneratedAt,
      }).from(clientsTable)
        .where(and(
          eq(clientsTable.tenantId, store.tenantId),
          eq(clientsTable.referralCode, upperCode),
        )).limit(1);

      if (referrer) {
        // Fetch referral settings for comprehensive policy enforcement
        const [refSettings] = await db.select({
          discountValue: referralSettingsTable.discountValue,
          discountType: referralSettingsTable.discountType,
          isEnabled: referralSettingsTable.isEnabled,
          expirationDays: referralSettingsTable.expirationDays,
          allowSelfReferral: referralSettingsTable.allowSelfReferral,
          requireFirstPurchase: referralSettingsTable.requireFirstPurchase,
          bonusValue: referralSettingsTable.bonusValue,
        }).from(referralSettingsTable)
          .where(eq(referralSettingsTable.tenantId, store.tenantId)).limit(1);

        // Check program is enabled
        if (!refSettings || refSettings.isEnabled !== false) {
          let referralEligible = true;

          // Expiration check (code lifecycle, not account age)
          if (referrer.referralCodeGeneratedAt && refSettings) {
            const expirationDays = refSettings.expirationDays ?? 30;
            const cutoff = new Date(referrer.referralCodeGeneratedAt);
            cutoff.setDate(cutoff.getDate() + expirationDays);
            if (new Date() > cutoff) referralEligible = false;
          }

          // Self-referral check
          if (referralEligible && !refSettings?.allowSelfReferral && referrer.email && data.customerEmail) {
            if (referrer.email.toLowerCase() === data.customerEmail.toLowerCase()) referralEligible = false;
          }

          // requireFirstPurchase: customer must not have any prior completed orders
          if (referralEligible && refSettings?.requireFirstPurchase && data.customerEmail) {
            const [priorOrder] = await db.select({ id: storeOrdersTable.id })
              .from(storeOrdersTable)
              .where(and(
                eq(storeOrdersTable.tenantId, store.tenantId),
                eq(storeOrdersTable.customerEmail, data.customerEmail.toLowerCase()),
                eq(storeOrdersTable.status, "completed"),
              )).limit(1);
            if (priorOrder) referralEligible = false;
          }

          if (referralEligible) {
            // Apply discount — respect discountType (percentage or fixed)
            const discValue = Number(refSettings?.discountValue ?? "5");
            appliedReferralDiscountType = refSettings?.discountType ?? "percentage";
            if (appliedReferralDiscountType === "fixed") {
              discountAmount = roundMoney(Math.min(discValue, subtotal));
            } else {
              // Default: percentage
              discountAmount = roundMoney(subtotal * (discValue / 100));
            }
            appliedReferralDiscountValue = discValue;
            appliedReferralCode = upperCode;
            appliedReferralReferrerId = referrer.id;
          }
        }
      }
    }

    const totalAmount = roundMoney(Math.max(0, subtotal - discountAmount));
    const orderId = generateId();
    const orderNumber = `#${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;

    // Phase 2.5: Find admin user, vitrine stage and trip names for trip-linked reservation(s).
    // NOTE: client find/create is deferred to inside the transaction for full atomicity.
    let reservationClientId: string | null = null;
    let reservationCreatedById: string | null = null;
    let vitrineStageId: string | null = null;
    // Parse birthdate here so it is accessible inside the transaction closure below.
    const parsedBirthDate: Date | null = data.customerBirthdate
      ? new Date(data.customerBirthdate.slice(0, 10) + "T12:00:00")
      : null;
    const tripNameMap = new Map<string, string>();
    if (tripLinkedProducts.size > 0) {
      // Find the first active user in the tenant (needed for reservation.createdById)
      const [adminUser] = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.tenantId, store.tenantId), eq(usersTable.isActive, true)))
        .limit(1);
      if (adminUser) {
        reservationCreatedById = adminUser.id;
        // Look up the "Vitrine" pipeline stage (isDefaultWeb=true, fallback: name='Vitrine')
        const stages = await db.select({ id: pipelineStagesTable.id, isDefaultWeb: pipelineStagesTable.isDefaultWeb, name: pipelineStagesTable.name })
          .from(pipelineStagesTable)
          .where(eq(pipelineStagesTable.tenantId, store.tenantId));
        const vitrine = stages.find(s => s.isDefaultWeb) ?? stages.find(s => s.name === "Vitrine");
        vitrineStageId = vitrine?.id ?? null;

        // Fetch trip names for deal titles
        const tripIds = [...tripLinkedProducts.keys()];
        const tripRows = await db.select({ id: tripsTable.id, name: tripsTable.name })
          .from(tripsTable)
          .where(and(inArray(tripsTable.id, tripIds), eq(tripsTable.tenantId, store.tenantId)));
        for (const t of tripRows) tripNameMap.set(t.id, t.name);
      } else {
        next(new AppError("Não foi possível criar a reserva: nenhum usuário ativo encontrado para esta agência", 500, "RESERVATION_NO_AGENCY_USER"));
        return;
      }
    }

    // TTL for pending reservations created via the storefront (configurable, default 15 min).
    // Clamp to [1, 1440] so an invalid or non-positive env value never produces an immediate expiry.
    const rawTtl = parseInt(process.env["PENDING_RESERVATION_TTL_MINUTES"] ?? "15", 10);
    const pendingReservationTtlMinutes = Number.isFinite(rawTtl) && rawTtl > 0 ? Math.min(rawTtl, 1440) : 15;
    const reservationExpiresAt = new Date(Date.now() + pendingReservationTtlMinutes * 60 * 1000);

    // Fetch tenant reservation prefix before transaction (used for reservation numbering)
    const tenantResPrefix = tripLinkedProducts.size > 0
      ? await getTenantReservationPrefix(store.tenantId)
      : "";
    const resYearMonth = getYearMonth();
    // Map to store locked trip types (populated during trip lock loop, used during reservation creation)
    const lockedTripTypes = new Map<string, string>();

    // Phase 3: Atomic transaction — lock trips, lock products, validate, write everything
    try {
      await db.transaction(async (tx) => {
        // Lock trips FIRST (sorted by tripId) to prevent deadlocks with concurrent checkouts
        // and with the internal reservations route which also locks trips.
        const sortedTripIds = Array.from(tripLinkedProducts.keys()).sort();
        for (const tripId of sortedTripIds) {
          const { product, totalQty } = tripLinkedProducts.get(tripId)!;
          const lockResult = await tx.execute(
            sql`SELECT id, available_seats, type FROM trips WHERE id = ${tripId} AND tenant_id = ${store.tenantId} FOR UPDATE`
          );
          const row = (lockResult as unknown as { rows: Array<{ id: string; available_seats: number; type: string }> }).rows[0];
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
          lockedTripTypes.set(tripId, row.type ?? "");
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

        // Find or create client inside the transaction for full atomicity.
        // If the transaction rolls back (e.g. stock exhausted), no orphan client record is left.
        if (reservationCreatedById) {
          // Capture in a const so TypeScript preserves the narrowing across awaits.
          const clientCreatedById: string = reservationCreatedById;
          const [existingClient] = await tx
            .select({ id: clientsTable.id, cpf: clientsTable.cpf, birthDate: clientsTable.birthDate })
            .from(clientsTable)
            .where(and(eq(clientsTable.tenantId, store.tenantId), eq(clientsTable.email, data.customerEmail)))
            .limit(1);
          if (existingClient) {
            reservationClientId = existingClient.id;
            const updateFields: Record<string, unknown> = {};
            if (!existingClient.birthDate && parsedBirthDate) updateFields.birthDate = parsedBirthDate;
            // Only backfill CPF if the client doesn't have one AND no other client in the
            // tenant already holds this CPF. Pre-checking avoids a constraint violation that
            // would abort the whole transaction.
            if (!existingClient.cpf && data.customerCpf) {
              const [cpfOwner] = await tx
                .select({ id: clientsTable.id })
                .from(clientsTable)
                .where(and(eq(clientsTable.tenantId, store.tenantId), eq(clientsTable.cpf, data.customerCpf)))
                .limit(1);
              if (!cpfOwner) updateFields.cpf = data.customerCpf;
            }
            if (Object.keys(updateFields).length > 0) {
              await tx.update(clientsTable).set(updateFields).where(eq(clientsTable.id, existingClient.id));
            }
          } else {
            const newClientId = generateId();
            // Determine whether the CPF is safe to insert (pre-check avoids aborting the
            // transaction on a unique-constraint violation — Postgres aborts the whole tx
            // on any statement error unless a savepoint is used).
            let cpfToInsert: string | undefined;
            if (data.customerCpf) {
              const [cpfOwner] = await tx
                .select({ id: clientsTable.id })
                .from(clientsTable)
                .where(and(eq(clientsTable.tenantId, store.tenantId), eq(clientsTable.cpf, data.customerCpf)))
                .limit(1);
              if (!cpfOwner) cpfToInsert = data.customerCpf;
            }
            // The pre-check SELECT above eliminates virtually all CPF conflicts before reaching here.
            // In the extremely rare race (two concurrent checkouts for the same CPF in the same millisecond),
            // the transaction will be retried by the caller rather than silently corrupting data.
            await tx.insert(clientsTable).values({
              id: newClientId,
              tenantId: store.tenantId,
              name: data.customerName,
              email: data.customerEmail,
              whatsapp: data.customerPhone ?? "",
              createdById: clientCreatedById,
              ...(cpfToInsert ? { cpf: cpfToInsert } : {}),
              ...(parsedBirthDate ? { birthDate: parsedBirthDate } : {}),
            });
            reservationClientId = newClientId;
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
          for (const [tripId, { product, totalQty, totalValue }] of tripLinkedProducts) {
            const voucherCode = generateVoucherCode();
            const reservationId = generateId();
            // Use real seats from the request if provided; fall back to sequential placeholders.
            // Cancellation logic uses seats.length for the decrement, so length must always equal totalQty.
            const realSeats = (data.seats && data.seats.length >= totalQty)
              ? data.seats.slice(0, totalQty)
              : Array.from({ length: totalQty }, (_, i) => String(i + 1));
            // Generate professional reservation number atomically inside the transaction
            const tripTypeRaw = lockedTripTypes.get(tripId) ?? "";
            const resTypeCode = tripTypeToCode(tripTypeRaw);
            const resSeq = await nextReservationSequence(store.tenantId, resYearMonth, resTypeCode, tx);
            const reservationNumber = buildReservationNumber(tenantResPrefix, resTypeCode, resYearMonth, resSeq);
            const reservationNotes = (data.customerNotes || data.notes) ?? undefined;
            await tx.insert(reservationsTable).values({
              id: reservationId,
              tenantId: store.tenantId,
              tripId,
              clientId: reservationClientId,
              seats: realSeats,
              totalValue: totalValue.toFixed(2),
              paidValue: "0",
              balance: totalValue.toFixed(2),
              status: "pending",
              voucherCode,
              reservationNumber,
              qrCode: `QR-${voucherCode}`,
              storeOrderId: orderNumber,
              createdById: reservationCreatedById,
              discountReferralCode: appliedReferralCode ?? undefined,
              discountReferralAmount: appliedReferralCode ? discountAmount.toFixed(2) : undefined,
              expiresAt: reservationExpiresAt,
              ...(reservationNotes ? { notes: reservationNotes } : {}),
            });
            // Decrement trip available_seats and increment reserved_seats
            await tx.update(tripsTable).set({
              availableSeats: sql`available_seats - ${totalQty}`,
              reservedSeats: sql`reserved_seats + ${totalQty}`,
            }).where(and(eq(tripsTable.id, tripId), eq(tripsTable.tenantId, store.tenantId)));

            // Auto-create deal in "Vitrine" pipeline stage for this reservation
            if (vitrineStageId && reservationCreatedById) {
              const dealId = generateId();
              const tripName = tripNameMap.get(tripId) ?? product.name;
              await tx.insert(dealsTable).values({
                id: dealId,
                tenantId: store.tenantId,
                stageId: vitrineStageId,
                title: `${data.customerName} — ${tripName}`,
                value: totalValue.toFixed(2),
                clientId: reservationClientId,
                tripId,
                ownerId: reservationCreatedById,
                status: "open",
                source: "website",
                autoCreated: true,
                reservationId,
              });
            }
          }
        }

        // Update coupon usage count atomically
        if (couponId) {
          await tx.update(storeCouponsTable)
            .set({ usageCount: sql`usage_count + 1` })
            .where(eq(storeCouponsTable.id, couponId));
        }

        // Record referral conversion: insert a new completed referral record
        if (appliedReferralCode && appliedReferralReferrerId) {
          const discountAmountForReferral = discountAmount;
          // Get bonus amount from referral settings
          const [refSettings] = await tx.select({ bonusValue: referralSettingsTable.bonusValue, bonusType: referralSettingsTable.bonusType })
            .from(referralSettingsTable).where(eq(referralSettingsTable.tenantId, store.tenantId)).limit(1);
          const bonusValue = refSettings ? Number(refSettings.bonusValue) : 10;

          // Insert a new completed referral record for this conversion
          await tx.insert(referralsTable).values({
            id: generateId(),
            tenantId: store.tenantId,
            referrerId: appliedReferralReferrerId,
            code: appliedReferralCode,
            status: "completed",
            referredId: reservationClientId,
            referredEmail: data.customerEmail,
            referredName: data.customerName,
            discountApplied: true,
            discountValue: (appliedReferralDiscountValue).toFixed(2),
            discountType: appliedReferralDiscountType,
            discountAmount: discountAmountForReferral.toFixed(2),
            bonusAmount: bonusValue.toFixed(2),
            convertedAt: new Date(),
          });

          // Update referrer client stats
          await tx.update(clientsTable)
            .set({
              totalReferrals: sql`COALESCE(total_referrals, 0) + 1`,
              successfulReferrals: sql`COALESCE(successful_referrals, 0) + 1`,
              referralEarnings: sql`COALESCE(referral_earnings, 0) + ${bonusValue.toFixed(2)}`,
            })
            .where(eq(clientsTable.id, appliedReferralReferrerId));

          // Update referred client: set referredById if not already set
          if (reservationClientId) {
            await tx.update(clientsTable)
              .set({ referredById: appliedReferralReferrerId })
              .where(and(
                eq(clientsTable.id, reservationClientId),
                sql`referred_by_id IS NULL`,
              ));
          }

          // Mark referral_tracking as converted — prefer cookieId for precision, fall back to code+tenant
          if (data.referralCookieId) {
            await tx.update(referralTrackingTable)
              .set({ converted: true, convertedAt: new Date(), updatedAt: new Date() })
              .where(and(
                eq(referralTrackingTable.tenantId, store.tenantId),
                eq(referralTrackingTable.cookieId, data.referralCookieId),
              ));
          } else {
            await tx.update(referralTrackingTable)
              .set({ converted: true, convertedAt: new Date(), updatedAt: new Date() })
              .where(and(
                eq(referralTrackingTable.tenantId, store.tenantId),
                eq(referralTrackingTable.referralCode, appliedReferralCode),
              ));
          }
        }

        // Update store order count atomically
        await tx.update(storesTable)
          .set({ totalOrders: sql`total_orders + 1` })
          .where(eq(storesTable.id, store.id));
      });
    } catch (txErr: unknown) {
      if (txErr instanceof Error && txErr.message === "insufficient_stock") {
        const e = txErr as Error & { productName?: string; available?: number };
        next(new ConflictError(`Estoque insuficiente para "${e.productName}". Disponível: ${e.available ?? 0}`, "INSUFFICIENT_STOCK")); return;
      }
      if (txErr instanceof Error && txErr.message === "no_seats") {
        const e = txErr as Error & { productName?: string; available?: number };
        next(new ConflictError(`Sem vagas suficientes para "${e.productName ?? ""}". Disponível: ${e.available ?? 0} vaga(s)`, "INSUFFICIENT_SEATS")); return;
      }
      if (txErr instanceof Error && txErr.message === "trip_not_found") {
        const e = txErr as Error & { productName?: string };
        next(new ValidationError(`Viagem vinculada ao produto "${e.productName ?? ""}" não encontrada`, "TRIP_NOT_FOUND")); return;
      }
      throw txErr;
    }

    const [order] = await db.select().from(storeOrdersTable)
      .where(eq(storeOrdersTable.id, orderId)).limit(1);
    const items = await db.select().from(storeOrderItemsTable)
      .where(eq(storeOrderItemsTable.orderId, orderId));

    // Fire-and-forget: create Clerk user + local user (if new) + send reservation confirmation email
    if (reservationClientId && tripLinkedProducts.size > 0) {
      const ffEmail = data.customerEmail;
      const ffName = data.customerName;
      const ffTenantId = store.tenantId;
      const ffAgencyName = store.name;
      const ffAgencyLogo = store.logo ?? "";
      const ffAgencyPhone = store.contactWhatsapp ?? store.contactPhone ?? "";
      const ffAgencyEmail = store.contactEmail ?? "";
      const ffStoreBase = store.customDomain
        ? `https://${store.customDomain}`
        : `https://${store.slug}.visitecrm.com.br`;
      const ffLoginUrl = `${ffStoreBase}/sign-in`;
      const ffConsultUrl = `${ffStoreBase}/consultar-pedido`;
      const ffOrderNumber = orderNumber;

      ;(async () => {
        try {
          // Step 1: Check if user already has a portal account; create one if not
          let credentials: { email: string; setupUrl: string; loginUrl: string } | undefined;

          const [existingUser] = await db.select({ id: usersTable.id })
            .from(usersTable)
            .where(and(eq(usersTable.email, ffEmail), eq(usersTable.tenantId, ffTenantId)))
            .limit(1);

          if (!existingUser) {
            const bootstrapPassword = generateTemporaryPassword();
            let newClerkId: string | null = null;

            try {
              const nameParts = ffName.trim().split(" ");
              const firstName = nameParts[0];
              const lastName = nameParts.slice(1).join(" ") || undefined;
              const clerkUser = await clerkClient.users.createUser({
                emailAddress: [ffEmail],
                password: bootstrapPassword,
                firstName,
                ...(lastName ? { lastName } : {}),
              });
              newClerkId = clerkUser.id;
            } catch (clerkErr: unknown) {
              const errors = (clerkErr as { errors?: Array<{ code: string }> })?.errors ?? [];
              const isDuplicate = errors.some((e) => e.code === "form_identifier_exists");
              if (!isDuplicate) {
                console.error("[store-public] Clerk user creation error:", clerkErr);
              }
            }

            if (newClerkId) {
              const referralBase = generateReferralCode(ffName);
              const referralSuffix = randomBytes(2).toString("hex").toUpperCase();
              const referralCode = `${referralBase}${referralSuffix}`;
              await db.insert(usersTable).values({
                id: generateId(),
                clerkId: newClerkId,
                tenantId: ffTenantId,
                name: ffName,
                email: ffEmail,
                role: "cliente",
                isActive: true,
                referralCode,
              });

              // Portal entry point for this storefront
              const portalUrl = `${ffStoreBase}/perfil`;

              // setupUrl starts as the regular portal URL; upgraded to a magic link if token succeeds
              let setupUrl: string = portalUrl;

              // Generate a one-time sign-in link that redirects to /perfil after authentication
              try {
                const signInToken = await clerkClient.signInTokens.createSignInToken({
                  userId: newClerkId,
                  expiresInSeconds: 604800, // 7 days
                });
                // Append redirect_url so Clerk lands the user on /perfil after auto-sign-in
                const redirectParam = encodeURIComponent(portalUrl);
                const tokenBase = signInToken.url;
                setupUrl = tokenBase.includes("?")
                  ? `${tokenBase}&redirect_url=${redirectParam}`
                  : `${tokenBase}?redirect_url=${redirectParam}`;
                credentials = { email: ffEmail, setupUrl, loginUrl: ffLoginUrl };
              } catch (tokenErr) {
                console.error("[store-public] Failed to create sign-in token:", tokenErr);
                // setupUrl remains as portalUrl — welcome email still goes out with regular link
                credentials = undefined;
              }

              // Always send a dedicated welcome email — even when token creation fails.
              // isMagicLink drives accurate copy in the email (auto-sign-in vs manual sign-in).
              sendWelcomeEmail(
                {
                  clientName: ffName,
                  clientEmail: ffEmail,
                  setupUrl,
                  loginUrl: ffLoginUrl,
                  agencyName: ffAgencyName,
                  agencyLogo: ffAgencyLogo || null,
                  isMagicLink: credentials !== undefined,
                },
                ffTenantId,
              ).catch((welcomeErr) => {
                console.error("[store-public] Failed to send welcome email:", welcomeErr);
              });
            }
          }

          // Step 2: Fetch the first reservation linked to this order (with trip data)
          const [reservation] = await db
            .select({
              reservationId: reservationsTable.id,
              reservationNumber: reservationsTable.reservationNumber,
              voucherCode: reservationsTable.voucherCode,
              seats: reservationsTable.seats,
              totalValue: reservationsTable.totalValue,
              tripName: tripsTable.name,
              tripDestination: tripsTable.destination,
              tripDepartureDate: tripsTable.departureDate,
              tripReturnDate: tripsTable.returnDate,
            })
            .from(reservationsTable)
            .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
            .where(eq(reservationsTable.storeOrderId, ffOrderNumber))
            .limit(1);

          if (!reservation) return;

          const depDate = reservation.tripDepartureDate as unknown as Date | null;
          const retDate = reservation.tripReturnDate as unknown as Date | null;

          const departureDateStr = depDate
            ? depDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
            : "A confirmar";

          let duration = "A confirmar";
          if (depDate && retDate) {
            const diffDays = Math.round((retDate.getTime() - depDate.getTime()) / (1000 * 60 * 60 * 24));
            const nights = diffDays > 0 ? diffDays : 0;
            const days = nights + 1;
            duration = `${days} dia${days !== 1 ? "s" : ""}${nights > 0 ? ` / ${nights} noite${nights !== 1 ? "s" : ""}` : ""}`;
          }

          const totalAmount = Number(reservation.totalValue ?? 0);
          const whatsappNumber = ffAgencyPhone.replace(/\D/g, "");
          const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : ffStoreBase;
          const voucherUrl = `${ffConsultUrl}?code=${reservation.voucherCode ?? ""}`;

          // Step 3: Enqueue combined reservation confirmation email (with credentials if new account)
          const subject = `Reserva Confirmada — ${reservation.reservationNumber ?? ffOrderNumber}`;
          await enqueueReservationConfirmationEmail({
            tenantId: ffTenantId,
            reservationId: reservation.reservationId,
            subject,
            props: {
              reservationNumber: reservation.reservationNumber ?? ffOrderNumber,
              voucherCode: reservation.voucherCode ?? "",
              clientName: ffName,
              clientCpf: data.customerCpf ?? "",
              clientEmail: ffEmail,
              clientPhone: data.customerPhone ?? "",
              tripTitle: reservation.tripName,
              destination: reservation.tripDestination,
              departureDate: departureDateStr,
              duration,
              seats: reservation.seats ?? [],
              totalAmount,
              amountPaid: 0,
              amountPending: totalAmount,
              paymentMethod: data.paymentMethod ?? "pix",
              paymentStatus: "pending",
              agencyName: ffAgencyName,
              agencyLogo: ffAgencyLogo,
              agencyPhone: ffAgencyPhone,
              agencyEmail: ffAgencyEmail,
              agencyWebsite: ffStoreBase,
              voucherUrl,
              consultUrl: ffConsultUrl,
              whatsappUrl,
              ...(credentials ? { credentials } : {}),
            },
          });
        } catch (err) {
          console.error("[store-public] Error sending post-booking email:", err);
        }
      })();
    }

    res.status(200).json({
      ...order,
      orderId: order.id,
      items,
      // Expose the reservation expiry deadline so the storefront can display a countdown timer.
      reservationExpiresAt: tripLinkedProducts.size > 0 ? reservationExpiresAt.toISOString() : null,
    });

    // Emit real-time seat update to all SSE listeners for each trip in this order
    for (const [tripId] of tripLinkedProducts) {
      broadcastSeatUpdate(tripId, store.tenantId).catch(() => {});
    }

    // Record client activity for reservation(s) created via the storefront
    if (reservationClientId && reservationCreatedById) {
      const totalFormatted = Number(order?.totalAmount ?? 0)
        .toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      writeClientActivity(
        reservationClientId,
        "reservation_created",
        `Reserva criada via loja — ${totalFormatted}`,
        reservationCreatedById,
        { storeOrderId: orderId },
      ).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

router.get("/public/store/:slug/orders/:orderNumber", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }

    const customerEmail = normalizeOrderEmail(req.query.email);
    if (!customerEmail) {
      next(new ValidationError("Email is required to look up an order", "VALIDATION_ERROR"));
      return;
    }

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
    if (!order) { next(new NotFoundError("Order not found", "NOT_FOUND")); return; }

    // Verify ownership: the provided email must match the order's customer email
    if (order.customerEmail.trim().toLowerCase() !== customerEmail) {
      next(new NotFoundError("Order not found", "NOT_FOUND"));
      return;
    }
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
    next(err);
  }
});

router.post("/public/store/:slug/referral/validate", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }
    const parsed = z.object({
      code: z.string().min(1),
      customerEmail: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }
    const code = parsed.data.code.toUpperCase();

    // Look up by client's permanent referral code
    const [referrer] = await db.select({
      id: clientsTable.id,
      name: clientsTable.name,
      email: clientsTable.email,
      referralCode: clientsTable.referralCode,
      referralCodeGeneratedAt: clientsTable.referralCodeGeneratedAt,
    }).from(clientsTable)
      .where(and(
        eq(clientsTable.tenantId, store.tenantId),
        eq(clientsTable.referralCode, code),
      )).limit(1);

    if (!referrer) {
      next(new ValidationError("Código de indicação inválido", "REFERRAL_CODE_INVALID", { valid: false })); return;
    }

    // Get discount % from referral settings
    const [settings] = await db.select({
      discountValue: referralSettingsTable.discountValue,
      discountType: referralSettingsTable.discountType,
      isEnabled: referralSettingsTable.isEnabled,
      expirationDays: referralSettingsTable.expirationDays,
      allowSelfReferral: referralSettingsTable.allowSelfReferral,
      requireFirstPurchase: referralSettingsTable.requireFirstPurchase,
    }).from(referralSettingsTable)
      .where(eq(referralSettingsTable.tenantId, store.tenantId)).limit(1);

    if (settings && !settings.isEnabled) {
      next(new ValidationError("Programa de indicação inativo", "REFERRAL_PROGRAM_INACTIVE", { valid: false })); return;
    }

    // Enforce expiration based on when the code was generated (not account age)
    const expirationDays = settings?.expirationDays ?? 30;
    if (referrer.referralCodeGeneratedAt) {
      const cutoff = new Date(referrer.referralCodeGeneratedAt);
      cutoff.setDate(cutoff.getDate() + expirationDays);
      if (new Date() > cutoff) {
        next(new ValidationError("Código de indicação expirado", "REFERRAL_CODE_EXPIRED", { valid: false })); return;
      }
    }

    // Self-referral check when customer email is provided
    if (!settings?.allowSelfReferral && parsed.data.customerEmail && referrer.email) {
      if (referrer.email.toLowerCase() === parsed.data.customerEmail.toLowerCase()) {
        next(new ValidationError("Você não pode usar seu próprio código de indicação", "REFERRAL_SELF_USE", { valid: false })); return;
      }
    }

    // Enforce requireFirstPurchase: customer must not have prior completed orders in this tenant
    if (settings?.requireFirstPurchase && parsed.data.customerEmail) {
      const [priorOrder] = await db.select({ id: storeOrdersTable.id })
        .from(storeOrdersTable)
        .where(and(
          eq(storeOrdersTable.tenantId, store.tenantId),
          eq(storeOrdersTable.customerEmail, parsed.data.customerEmail.toLowerCase()),
          eq(storeOrdersTable.status, "completed"),
        )).limit(1);
      if (priorOrder) {
        next(new ValidationError("Código de indicação válido apenas para novos clientes", "REFERRAL_EXISTING_CUSTOMER", { valid: false })); return;
      }
    }

    const discountPercent = settings?.discountType === "percentage"
      ? Number(settings.discountValue)
      : 5;

    const referrerName = referrer.name ?? "um amigo";
    res.json({
      valid: true,
      code,
      referrerName,
      discountPercent,
      discountType: settings?.discountType ?? "percentage",
      description: `Desconto de ${discountPercent}% por indicação de ${referrerName}`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/public/store/:slug/referral/info", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }
    const code = (req.query.code as string | undefined)?.toUpperCase();
    if (!code) { next(new ValidationError("code is required", "VALIDATION_ERROR")); return; }

    // Look up by client's permanent referral code
    const [referrer] = await db.select({
      id: clientsTable.id,
      name: clientsTable.name,
    }).from(clientsTable)
      .where(and(
        eq(clientsTable.tenantId, store.tenantId),
        eq(clientsTable.referralCode, code),
      )).limit(1);

    if (!referrer) {
      next(new NotFoundError("Referral not found", "NOT_FOUND"));
      return;
    }

    // Get discount % from referral settings
    const [settings] = await db.select({
      discountValue: referralSettingsTable.discountValue,
      discountType: referralSettingsTable.discountType,
      isActive: referralSettingsTable.isEnabled,
    }).from(referralSettingsTable)
      .where(eq(referralSettingsTable.tenantId, store.tenantId)).limit(1);

    if (settings && !settings.isActive) {
      next(new AppError("Referral program is inactive", 400, "REFERRAL_PROGRAM_INACTIVE"));
      return;
    }

    const discountPercent = settings?.discountType === "percentage"
      ? Number(settings.discountValue)
      : 5;

    res.json({
      code,
      referrerName: referrer.name ?? "um amigo",
      discountPercent,
      discountType: settings?.discountType ?? "percentage",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/public/store/:slug/referral/track", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }
    const parsed = z.object({
      code: z.string().min(1),
      serverCookieId: z.string().optional(),
      landingPage: z.string().optional(),
      utmSource: z.string().optional(),
      utmMedium: z.string().optional(),
      utmCampaign: z.string().optional(),
      utmContent: z.string().optional(),
      utmTerm: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }
    const code = parsed.data.code.toUpperCase();
    const userAgent = req.headers["user-agent"] ?? "";
    const ipAddress = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket?.remoteAddress ?? "";

    // Only accept server-issued cookie IDs (those that exist in DB for this tenant)
    // Never trust client-provided IDs that don't match an existing record
    let cookieId: string;
    let existingRecord: { id: string; pagesVisited: unknown } | undefined;

    if (parsed.data.serverCookieId) {
      // Verify the provided ID is actually server-issued (exists in DB for this tenant)
      const [found] = await db.select({ id: referralTrackingTable.id, pagesVisited: referralTrackingTable.pagesVisited })
        .from(referralTrackingTable)
        .where(and(
          eq(referralTrackingTable.tenantId, store.tenantId),
          eq(referralTrackingTable.cookieId, parsed.data.serverCookieId),
        )).limit(1);
      if (found) {
        // Recognized server-issued ID — update existing record
        cookieId = parsed.data.serverCookieId;
        existingRecord = found;
      } else {
        // Unrecognized — ignore and issue a new one
        cookieId = generateCookieId();
      }
    } else {
      // First visit — always generate server-side
      cookieId = generateCookieId();
    }

    if (existingRecord) {
      const pages = Array.isArray(existingRecord.pagesVisited) ? existingRecord.pagesVisited as string[] : [];
      if (parsed.data.landingPage) pages.push(parsed.data.landingPage);
      await db.update(referralTrackingTable).set({
        lastVisit: new Date(),
        visitsCount: sql`visits_count + 1`,
        pagesVisited: pages,
        updatedAt: new Date(),
      }).where(and(
        eq(referralTrackingTable.tenantId, store.tenantId),
        eq(referralTrackingTable.cookieId, cookieId),
      ));
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

    // Always return the server-issued cookie ID in header for client persistence
    res.setHeader("X-Referral-Cookie-Id", cookieId);

    res.json({ cookieId, tracked: true });
  } catch (err) {
    next(err);
  }
});

router.post("/public/store/:slug/coupons/validate", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }
    const parsed = z.object({
      code: z.string().min(1),
      cartTotal: z.number().nonnegative().optional(),
      orderTotal: z.number().nonnegative().optional(),
      items: z.array(z.object({ productId: z.string(), quantity: z.number().int() })).optional(),
    }).safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }
    const { code } = parsed.data;
    const cartTotal = parsed.data.cartTotal ?? parsed.data.orderTotal ?? 0;
    const [coupon] = await db.select().from(storeCouponsTable)
      .where(and(
        eq(storeCouponsTable.storeId, store.id),
        eq(storeCouponsTable.code, code),
        eq(storeCouponsTable.isActive, true),
      )).limit(1);
    if (!coupon) {
      next(new ValidationError("Cupom inválido", "COUPON_INVALID", { valid: false })); return;
    }
    const now = new Date();
    if (coupon.startsAt > now) {
      next(new ValidationError("Cupom ainda não está vigente", "COUPON_NOT_STARTED", { valid: false })); return;
    }
    if (coupon.expiresAt < now) {
      next(new ValidationError("Cupom expirado", "COUPON_EXPIRED", { valid: false })); return;
    }
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      next(new ValidationError("Cupom esgotado", "COUPON_EXHAUSTED", { valid: false })); return;
    }
    if (coupon.minPurchaseAmount && cartTotal < parseFloat(coupon.minPurchaseAmount)) {
      next(new ValidationError(`Valor mínimo para este cupom: R$ ${parseFloat(coupon.minPurchaseAmount).toFixed(2)}`, "COUPON_MIN_PURCHASE", { valid: false })); return;
    }
    let discountAmount = 0;
    if (coupon.type === "percentage") {
      discountAmount = roundMoney(cartTotal * (Number(coupon.value) / 100));
    } else if (coupon.type === "fixed") {
      discountAmount = roundMoney(Number(coupon.value));
    }
    if (coupon.maxDiscountAmount) {
      discountAmount = Math.min(discountAmount, roundMoney(Number(coupon.maxDiscountAmount)));
    }
    res.json({
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discountAmount,
      description: coupon.description,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/public/store/:slug/reviews", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const { slug } = req.params;
    const { limit: limitStr, featured } = req.query;
    const store = await db.query.storesTable.findFirst({ where: eq(storesTable.slug, slug as string) });
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }
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
    next(err);
  }
});

export default router;
