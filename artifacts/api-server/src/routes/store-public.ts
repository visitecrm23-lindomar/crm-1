import { Router, type NextFunction } from "express";
import { db } from "@workspace/db";
import { addSeatClient, removeSeatClient, emitSeatUpdate } from "../lib/seat-sse";
import { broadcastSeatUpdate } from "../lib/realtime";
import { RESERVATION_STATUS } from "@workspace/permissions";
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
  referralTrackingTable,
  referralSettingsTable,
  referralsTable,
  tenantsTable,
  vehicleLayoutsTable,
} from "@workspace/db";
import { eq, and, desc, asc, ilike, or, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { getTenantReservationPrefix, getYearMonth } from "../lib/reservation-number";
import { randomBytes } from "crypto";
import { writeClientActivity } from "../lib/activities";
import { getClientIp } from "../lib/get-client-ip";
import { resolveCheckoutDiscounts } from "../services/checkout/discounts";
import { prepareCheckoutItems } from "../services/checkout/items";
import { loadReservationContext } from "../services/checkout/reservation-context";
import { persistCheckoutOrder } from "../services/checkout/persist-order";
import { runPostBookingSideEffects } from "../services/checkout/post-booking";

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

router.get("/public/store/:slug", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }

    const [tenant] = await db.select({ settings: tenantsTable.settings })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, store.tenantId))
      .limit(1);
    const tenantSettings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const couponsEnabled = tenantSettings.couponsEnabled !== false;
    const referralsEnabled = tenantSettings.referralsEnabled !== false;

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
      couponsEnabled,
      referralsEnabled,
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
      layoutId: tripsTable.layoutId,
    }).from(tripsTable)
      .where(and(
        eq(tripsTable.id, req.params.tripId),
        eq(tripsTable.tenantId, store.tenantId),
      )).limit(1);

    if (!trip) { next(new NotFoundError("Trip not found", "NOT_FOUND")); return; }

    let numberingType = "sequential";
    if (trip.layoutId) {
      const [layout] = await db.select({ numberingType: vehicleLayoutsTable.numberingType })
        .from(vehicleLayoutsTable)
        .where(and(eq(vehicleLayoutsTable.id, trip.layoutId), eq(vehicleLayoutsTable.tenantId, store.tenantId)))
        .limit(1);
      if (layout) numberingType = layout.numberingType;
    }

    const ACTIVE_STATUSES = [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED];
    const reservations = await db.select({ seats: reservationsTable.seats, status: reservationsTable.status })
      .from(reservationsTable)
      .where(and(
        eq(reservationsTable.tripId, trip.id),
        eq(reservationsTable.tenantId, store.tenantId),
        inArray(reservationsTable.status, [...ACTIVE_STATUSES]),
      ));

    const occupiedSeats: Record<string, string> = {};
    for (const r of reservations) {
      const seatStatus = r.status === RESERVATION_STATUS.CONFIRMED ? "confirmed" : "reserved";
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
      numberingType,
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
    const data = { ...parsed.data, ipAddress: getClientIp(req) ?? parsed.data.ipAddress };

    const { subtotal, orderItemsData, fetchedProducts, quantityByProductId, tripLinkedProducts } =
      await prepareCheckoutItems({ storeId: store.id, tenantId: store.tenantId, items: data.items });

    const discounts = await resolveCheckoutDiscounts({
      storeId: store.id,
      tenantId: store.tenantId,
      subtotal,
      couponCode: data.couponCode,
      referralCode: data.referralCode,
      customerEmail: data.customerEmail,
    });

    const totalAmount = roundMoney(Math.max(0, subtotal - discounts.discountAmount));
    const orderId = generateId();
    const orderNumber = `#${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;
    const orderPaymentToken = (await import("node:crypto")).randomBytes(32).toString("base64url");

    const parsedBirthDate: Date | null = data.customerBirthdate
      ? new Date(data.customerBirthdate.slice(0, 10) + "T12:00:00")
      : null;

    let reservationCreatedById: string | null = null;
    let vitrineStageId: string | null = null;
    let tripNameMap = new Map<string, string>();
    let tenantResPrefix = "";
    if (tripLinkedProducts.size > 0) {
      const ctx = await loadReservationContext({
        tenantId: store.tenantId,
        tripIds: [...tripLinkedProducts.keys()],
      });
      reservationCreatedById = ctx.reservationCreatedById;
      vitrineStageId = ctx.vitrineStageId;
      tripNameMap = ctx.tripNameMap;
      tenantResPrefix = await getTenantReservationPrefix(store.tenantId);
    }

    const rawTtl = parseInt(process.env["PENDING_RESERVATION_TTL_MINUTES"] ?? "15", 10);
    const pendingReservationTtlMinutes = Number.isFinite(rawTtl) && rawTtl > 0 ? Math.min(rawTtl, 1440) : 15;
    const reservationExpiresAt = new Date(Date.now() + pendingReservationTtlMinutes * 60 * 1000);

    let reservationClientId: string | null = null;
    try {
      const result = await persistCheckoutOrder({
        store, data, orderId, orderNumber, orderPaymentToken,
        subtotal, discountAmount: discounts.discountAmount, totalAmount,
        couponId: discounts.couponId,
        appliedReferralCode: discounts.appliedReferralCode,
        appliedReferralReferrerId: discounts.appliedReferralReferrerId,
        appliedReferralDiscountValue: discounts.appliedReferralDiscountValue,
        appliedReferralDiscountType: discounts.appliedReferralDiscountType,
        orderItemsData, fetchedProducts, quantityByProductId, tripLinkedProducts,
        reservationCreatedById, vitrineStageId, parsedBirthDate, tripNameMap,
        reservationExpiresAt, tenantResPrefix, resYearMonth: getYearMonth(),
      });
      reservationClientId = result.reservationClientId;
    } catch (txErr: unknown) {
      if (txErr instanceof Error) {
        const tagged = txErr as Error & { productName?: string; available?: number };
        if (txErr.message === "insufficient_stock") {
          next(new ConflictError(`Estoque insuficiente para "${tagged.productName}". Disponível: ${tagged.available ?? 0}`, "INSUFFICIENT_STOCK")); return;
        }
        if (txErr.message === "no_seats") {
          next(new ConflictError(`Sem vagas suficientes para "${tagged.productName ?? ""}". Disponível: ${tagged.available ?? 0} vaga(s)`, "INSUFFICIENT_SEATS")); return;
        }
        if (txErr.message === "trip_not_found") {
          next(new ValidationError(`Viagem vinculada ao produto "${tagged.productName ?? ""}" não encontrada`, "TRIP_NOT_FOUND")); return;
        }
      }
      throw txErr;
    }

    const [order] = await db.select().from(storeOrdersTable)
      .where(eq(storeOrdersTable.id, orderId)).limit(1);
    const items = await db.select().from(storeOrderItemsTable)
      .where(eq(storeOrderItemsTable.orderId, orderId));

    if (reservationClientId && tripLinkedProducts.size > 0) {
      void runPostBookingSideEffects({
        store,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        customerCpf: data.customerCpf,
        customerPhone: data.customerPhone,
        paymentMethod: data.paymentMethod,
        orderNumber,
      });
    }

    res.status(200).json({
      ...order,
      orderId: order.id,
      items,
      paymentToken: orderPaymentToken,
      reservationExpiresAt: tripLinkedProducts.size > 0 ? reservationExpiresAt.toISOString() : null,
    });

    for (const [tripId] of tripLinkedProducts) {
      broadcastSeatUpdate(tripId, store.tenantId).catch(() => {});
    }

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

// Attach a gateway payment id (Stripe paymentIntentId / MP payment id) to
// an order. Gated by the one-shot paymentToken returned at order creation.
router.post("/public/store/:slug/orders/:orderNumber/payment-intent", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const store = await getActiveStore(req.params.slug);
    if (!store) { next(new NotFoundError("Store not found", "NOT_FOUND")); return; }

    const body = (req.body ?? {}) as { paymentIntentId?: unknown; paymentToken?: unknown; paymentChargeId?: unknown };
    const paymentIntentId = typeof body.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";
    const paymentToken = typeof body.paymentToken === "string" ? body.paymentToken.trim() : "";
    const paymentChargeId = typeof body.paymentChargeId === "string" ? body.paymentChargeId.trim() : null;

    if (!paymentIntentId) {
      next(new ValidationError("paymentIntentId is required", "VALIDATION_ERROR"));
      return;
    }
    if (!paymentToken) {
      next(new ValidationError("paymentToken is required", "VALIDATION_ERROR"));
      return;
    }

    const [order] = await db
      .select({
        id: storeOrdersTable.id,
        existingPaymentIntentId: storeOrdersTable.paymentIntentId,
        storedPaymentToken: storeOrdersTable.paymentToken,
      })
      .from(storeOrdersTable)
      .where(and(
        eq(storeOrdersTable.tenantId, store.tenantId),
        eq(storeOrdersTable.storeId, store.id),
        eq(storeOrdersTable.orderNumber, req.params.orderNumber),
      ))
      .limit(1);

    if (!order) { next(new NotFoundError("Order not found", "NOT_FOUND")); return; }

    const stored = order.storedPaymentToken ?? "";
    const a = Buffer.from(paymentToken);
    const b = Buffer.from(stored);
    const tokenMatches = a.length === b.length && a.length > 0 && (await import("node:crypto")).timingSafeEqual(a, b);
    if (!tokenMatches) {
      next(new ValidationError("Invalid payment token", "INVALID_TOKEN"));
      return;
    }

    if (order.existingPaymentIntentId && order.existingPaymentIntentId !== paymentIntentId) {
      next(new ValidationError("Order already has a different paymentIntentId", "ALREADY_SET"));
      return;
    }

    await db
      .update(storeOrdersTable)
      .set({
        paymentIntentId,
        ...(paymentChargeId ? { paymentChargeId } : {}),
      })
      .where(eq(storeOrdersTable.id, order.id));

    res.json({ ok: true });
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
    const [tenantRowRef] = await db.select({ settings: tenantsTable.settings }).from(tenantsTable).where(eq(tenantsTable.id, store.tenantId)).limit(1);
    if ((tenantRowRef?.settings as Record<string, unknown> | null)?.referralsEnabled === false) {
      next(new ValidationError("Programa de indicação inativo", "REFERRAL_PROGRAM_INACTIVE", { valid: false })); return;
    }
    const parsed = z.object({
      code: z.string().min(1),
      customerEmail: z.string().optional(),
      cookieId: z.string().optional(),
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

    const discountType = settings?.discountType ?? "percentage";
    const discountValue = Number(settings?.discountValue ?? 5);
    const discountPercent = discountType === "percentage" ? discountValue : 0;

    const referrerName = referrer.name ?? "um amigo";

    const discountLabel = discountType === "fixed"
      ? `R$ ${discountValue.toFixed(2).replace(".", ",")}`
      : `${discountValue}%`;

    const validatorIp = getClientIp(req);
    const validatorCookieId = parsed.data.cookieId;
    if (validatorIp && validatorCookieId) {
      db.update(referralTrackingTable)
        .set({ ipAddress: validatorIp, updatedAt: new Date() })
        .where(and(
          eq(referralTrackingTable.tenantId, store.tenantId),
          eq(referralTrackingTable.cookieId, validatorCookieId),
        ))
        .catch(() => undefined);
    }

    res.json({
      valid: true,
      code,
      referrerName,
      discountPercent,
      discountValue,
      discountType,
      description: `Desconto de ${discountLabel} por indicação de ${referrerName}`,
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

    const discountType = settings?.discountType ?? "percentage";
    const discountValue = Number(settings?.discountValue ?? 5);
    const discountPercent = discountType === "percentage" ? discountValue : 0;

    res.json({
      code,
      referrerName: referrer.name ?? "um amigo",
      discountPercent,
      discountValue,
      discountType,
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
    const ipAddress = getClientIp(req) ?? "";

    // Only accept server-issued cookie IDs (those that exist in DB for this tenant)
    // Never trust client-provided IDs that don't match an existing record
    let cookieId: string;
    let existingRecord: { id: string; pagesVisited: unknown; referralCode: string } | undefined;

    if (parsed.data.serverCookieId) {
      // Verify the provided ID is actually server-issued (exists in DB for this tenant)
      const [found] = await db.select({
        id: referralTrackingTable.id,
        pagesVisited: referralTrackingTable.pagesVisited,
        referralCode: referralTrackingTable.referralCode,
      })
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

    const now = new Date();
    if (existingRecord) {
      const pages = Array.isArray(existingRecord.pagesVisited) ? existingRecord.pagesVisited as string[] : [];
      if (parsed.data.landingPage) pages.push(parsed.data.landingPage);
      await db.update(referralTrackingTable).set({
        lastVisit: now,
        visitsCount: sql`visits_count + 1`,
        pagesVisited: pages,
        updatedAt: now,
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

    // Sync lastVisit and visitsCount back to the referrals table so the admin panel shows live data.
    // Use the tracking record's original referralCode (not the request's code) to prevent
    // misattribution when a returning visitor's cookie is tied to a different code.
    const syncCode = existingRecord ? existingRecord.referralCode : code;
    await db.update(referralsTable)
      .set({
        lastVisit: now,
        visitsCount: sql`visits_count + 1`,
        updatedAt: now,
      })
      .where(and(
        eq(referralsTable.tenantId, store.tenantId),
        eq(referralsTable.code, syncCode),
      ));

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
    const [tenantRowCpn] = await db.select({ settings: tenantsTable.settings }).from(tenantsTable).where(eq(tenantsTable.id, store.tenantId)).limit(1);
    if ((tenantRowCpn?.settings as Record<string, unknown> | null)?.couponsEnabled === false) {
      next(new ValidationError("Cupons de desconto não estão disponíveis", "COUPONS_DISABLED", { valid: false })); return;
    }
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
