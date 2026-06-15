import { Router, type NextFunction, type Request, type Response } from "express";
import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import {
  partnersTable,
  partnerProductsTable,
  partnerAvailabilityTable,
  partnerCommissionsTable,
  storeOrdersTable,
  storeOrderItemsTable,
  storeProductsTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, MANAGEMENT_ROLES } from "../lib/tenant";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { generateId } from "../lib/id";

const router = Router();

// ────── Password helpers ──────────────────────────────────────────────────────

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  try {
    const hashBuf = Buffer.from(hash!, "hex");
    const derivedBuf = scryptSync(password, salt!, 64);
    return timingSafeEqual(hashBuf, derivedBuf);
  } catch {
    return false;
  }
}

// ────── Partner JWT helpers ───────────────────────────────────────────────────

function partnerSecret(): string {
  return (process.env["CREDENTIAL_ENCRYPTION_KEY"] ?? "dev-fallback-secret") + "_partner_portal_v1";
}

export function createPartnerToken(partnerId: string): string {
  const payload = JSON.stringify({ partnerId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", partnerSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyPartnerToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", partnerSecret()).update(encoded).digest("base64url");
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as { partnerId: string; exp: number };
    if (payload.exp < Date.now()) return null;
    return payload.partnerId;
  } catch {
    return null;
  }
}

async function requirePartnerAuth(
  req: Request,
  res: Response,
): Promise<{ partnerId: string; tenantId: string; commissionPct: string } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Partner not authenticated", code: "PARTNER_UNAUTHORIZED" });
    return null;
  }
  const partnerId = verifyPartnerToken(auth.slice(7));
  if (!partnerId) {
    res.status(401).json({ error: "Invalid or expired token", code: "PARTNER_TOKEN_INVALID" });
    return null;
  }
  const [partner] = await db
    .select({ id: partnersTable.id, tenantId: partnersTable.tenantId, status: partnersTable.status, commissionPct: partnersTable.commissionPct })
    .from(partnersTable)
    .where(eq(partnersTable.id, partnerId))
    .limit(1);
  if (!partner || partner.status !== "active") {
    res.status(403).json({ error: "Partner account not active", code: "PARTNER_INACTIVE" });
    return null;
  }
  return { partnerId: partner.id, tenantId: partner.tenantId, commissionPct: partner.commissionPct };
}

// ════════════════════════════════════════════════════════════════════════════
//  PARTNER PORTAL ROUTES  (JWT auth — no Clerk)
// ════════════════════════════════════════════════════════════════════════════

// POST /api/partner/login
router.post("/partner/login", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).safeParse(req.body);
    if (!body.success) { next(new ValidationError("Email e senha são obrigatórios")); return; }

    const [partner] = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.email, body.data.email.toLowerCase()))
      .limit(1);

    if (!partner || !partner.passwordHash || !verifyPassword(body.data.password, partner.passwordHash)) {
      res.status(401).json({ error: "Credenciais inválidas", code: "INVALID_CREDENTIALS" });
      return;
    }
    if (partner.status === "suspended") {
      res.status(403).json({ error: "Conta suspensa", code: "PARTNER_SUSPENDED" });
      return;
    }
    if (partner.status === "pending") {
      res.status(403).json({ error: "Conta aguardando aprovação", code: "PARTNER_PENDING" });
      return;
    }

    const token = createPartnerToken(partner.id);
    res.json({
      token,
      partner: {
        id: partner.id,
        name: partner.name,
        email: partner.email,
        slug: partner.slug,
        status: partner.status,
        commissionPct: partner.commissionPct,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/partner/me
router.get("/partner/me", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = await requirePartnerAuth(req, res);
    if (!auth) return;
    const [partner] = await db.select({
      id: partnersTable.id,
      name: partnersTable.name,
      email: partnersTable.email,
      cnpj: partnersTable.cnpj,
      slug: partnersTable.slug,
      description: partnersTable.description,
      phone: partnersTable.phone,
      logo: partnersTable.logo,
      status: partnersTable.status,
      commissionPct: partnersTable.commissionPct,
    }).from(partnersTable).where(eq(partnersTable.id, auth.partnerId)).limit(1);
    if (!partner) { next(new NotFoundError("Parceiro não encontrado", "NOT_FOUND")); return; }
    res.json(partner);
  } catch (err) { next(err); }
});

// PUT /api/partner/me
router.put("/partner/me", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = await requirePartnerAuth(req, res);
    if (!auth) return;
    const body = z.object({
      name: z.string().min(1).max(200).optional(),
      cnpj: z.string().max(20).nullable().optional(),
      description: z.string().max(1000).nullable().optional(),
      phone: z.string().max(30).nullable().optional(),
      logo: z.string().url().nullable().optional(),
    }).safeParse(req.body);
    if (!body.success) { next(new ValidationError(String(body.error.message))); return; }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.cnpj !== undefined) updates.cnpj = body.data.cnpj;
    if (body.data.description !== undefined) updates.description = body.data.description;
    if (body.data.phone !== undefined) updates.phone = body.data.phone;
    if (body.data.logo !== undefined) updates.logo = body.data.logo;
    await db.update(partnersTable).set(updates).where(eq(partnersTable.id, auth.partnerId));
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/partner/products
router.get("/partner/products", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = await requirePartnerAuth(req, res);
    if (!auth) return;
    const products = await db.select().from(partnerProductsTable)
      .where(eq(partnerProductsTable.partnerId, auth.partnerId))
      .orderBy(desc(partnerProductsTable.createdAt));
    res.json({ data: products });
  } catch (err) { next(err); }
});

// POST /api/partner/products
router.post("/partner/products", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = await requirePartnerAuth(req, res);
    if (!auth) return;
    const body = z.object({
      type: z.enum(["passeio", "transfer", "experiencia", "ingresso"]),
      title: z.string().min(1).max(200),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      price: z.number().nonnegative(),
      maxCapacity: z.number().int().min(1).default(10),
      durationMinutes: z.number().int().positive().nullable().optional(),
      meetingPoint: z.string().max(500).nullable().optional(),
      cancellationPolicy: z.string().max(1000).nullable().optional(),
      images: z.array(z.string()).default([]),
    }).safeParse(req.body);
    if (!body.success) { next(new ValidationError(String(body.error.message))); return; }
    const slug = body.data.slug ?? body.data.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 100);
    const id = generateId();
    await db.insert(partnerProductsTable).values({
      id,
      partnerId: auth.partnerId,
      tenantId: auth.tenantId,
      type: body.data.type,
      title: body.data.title,
      slug,
      description: body.data.description ?? null,
      price: body.data.price.toFixed(2),
      maxCapacity: body.data.maxCapacity,
      durationMinutes: body.data.durationMinutes ?? null,
      meetingPoint: body.data.meetingPoint ?? null,
      cancellationPolicy: body.data.cancellationPolicy ?? null,
      images: body.data.images,
      status: "pending",
    });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

// PUT /api/partner/products/:id
router.put("/partner/products/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = await requirePartnerAuth(req, res);
    if (!auth) return;
    const [existing] = await db.select({ id: partnerProductsTable.id })
      .from(partnerProductsTable)
      .where(and(eq(partnerProductsTable.id, req.params.id!), eq(partnerProductsTable.partnerId, auth.partnerId)))
      .limit(1);
    if (!existing) { next(new NotFoundError("Produto não encontrado", "NOT_FOUND")); return; }
    const body = z.object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      price: z.number().nonnegative().optional(),
      maxCapacity: z.number().int().min(1).optional(),
      durationMinutes: z.number().int().positive().nullable().optional(),
      meetingPoint: z.string().max(500).nullable().optional(),
      cancellationPolicy: z.string().max(1000).nullable().optional(),
      images: z.array(z.string()).optional(),
    }).safeParse(req.body);
    if (!body.success) { next(new ValidationError(String(body.error.message))); return; }
    const updates: Record<string, unknown> = { updatedAt: new Date(), status: "pending" };
    if (body.data.title !== undefined) updates.title = body.data.title;
    if (body.data.description !== undefined) updates.description = body.data.description;
    if (body.data.price !== undefined) updates.price = body.data.price.toFixed(2);
    if (body.data.maxCapacity !== undefined) updates.maxCapacity = body.data.maxCapacity;
    if (body.data.durationMinutes !== undefined) updates.durationMinutes = body.data.durationMinutes;
    if (body.data.meetingPoint !== undefined) updates.meetingPoint = body.data.meetingPoint;
    if (body.data.cancellationPolicy !== undefined) updates.cancellationPolicy = body.data.cancellationPolicy;
    if (body.data.images !== undefined) updates.images = body.data.images;
    await db.update(partnerProductsTable).set(updates).where(eq(partnerProductsTable.id, existing.id));
    res.status(204).end();
  } catch (err) { next(err); }
});

// DELETE /api/partner/products/:id
router.delete("/partner/products/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = await requirePartnerAuth(req, res);
    if (!auth) return;
    await db.delete(partnerProductsTable)
      .where(and(eq(partnerProductsTable.id, req.params.id!), eq(partnerProductsTable.partnerId, auth.partnerId)));
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/partner/products/:id/availability
router.get("/partner/products/:id/availability", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = await requirePartnerAuth(req, res);
    if (!auth) return;
    const [product] = await db.select({ id: partnerProductsTable.id })
      .from(partnerProductsTable)
      .where(and(eq(partnerProductsTable.id, req.params.id!), eq(partnerProductsTable.partnerId, auth.partnerId)))
      .limit(1);
    if (!product) { next(new NotFoundError("Produto não encontrado", "NOT_FOUND")); return; }
    const avail = await db.select().from(partnerAvailabilityTable)
      .where(eq(partnerAvailabilityTable.productId, product.id))
      .orderBy(partnerAvailabilityTable.date);
    res.json({ data: avail });
  } catch (err) { next(err); }
});

// PUT /api/partner/products/:id/availability — upsert by date
router.put("/partner/products/:id/availability", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = await requirePartnerAuth(req, res);
    if (!auth) return;
    const [product] = await db.select({ id: partnerProductsTable.id })
      .from(partnerProductsTable)
      .where(and(eq(partnerProductsTable.id, req.params.id!), eq(partnerProductsTable.partnerId, auth.partnerId)))
      .limit(1);
    if (!product) { next(new NotFoundError("Produto não encontrado", "NOT_FOUND")); return; }
    const body = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      spotsTotal: z.number().int().min(0),
    }).safeParse(req.body);
    if (!body.success) { next(new ValidationError(String(body.error.message))); return; }
    const [existing] = await db.select({ id: partnerAvailabilityTable.id, spotsUsed: partnerAvailabilityTable.spotsUsed })
      .from(partnerAvailabilityTable)
      .where(and(eq(partnerAvailabilityTable.productId, product.id), eq(partnerAvailabilityTable.date, body.data.date)))
      .limit(1);
    if (existing) {
      await db.update(partnerAvailabilityTable)
        .set({ spotsTotal: body.data.spotsTotal, updatedAt: new Date() })
        .where(eq(partnerAvailabilityTable.id, existing.id));
    } else {
      await db.insert(partnerAvailabilityTable).values({
        id: generateId(),
        productId: product.id,
        date: body.data.date,
        spotsTotal: body.data.spotsTotal,
        spotsUsed: 0,
      });
    }
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/partner/commissions
router.get("/partner/commissions", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = await requirePartnerAuth(req, res);
    if (!auth) return;
    const { period } = req.query;
    const conditions = [eq(partnerCommissionsTable.partnerId, auth.partnerId)];
    if (period && typeof period === "string") conditions.push(eq(partnerCommissionsTable.period, period));
    const commissions = await db.select().from(partnerCommissionsTable)
      .where(and(...conditions))
      .orderBy(desc(partnerCommissionsTable.createdAt));
    const totals = commissions.reduce(
      (acc, c) => ({
        gross: acc.gross + Number(c.grossAmount),
        partner: acc.partner + Number(c.partnerAmount),
        agency: acc.agency + Number(c.agencyAmount),
        pending: c.status === "pending" ? acc.pending + Number(c.partnerAmount) : acc.pending,
        paid: c.status === "paid" ? acc.paid + Number(c.partnerAmount) : acc.paid,
      }),
      { gross: 0, partner: 0, agency: 0, pending: 0, paid: 0 },
    );
    res.json({ data: commissions, totals });
  } catch (err) { next(err); }
});

// GET /api/partner/orders
router.get("/partner/orders", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = await requirePartnerAuth(req, res);
    if (!auth) return;
    const commissions = await db.select({
      orderId: partnerCommissionsTable.orderId,
      grossAmount: partnerCommissionsTable.grossAmount,
      partnerAmount: partnerCommissionsTable.partnerAmount,
      status: partnerCommissionsTable.status,
      period: partnerCommissionsTable.period,
      createdAt: partnerCommissionsTable.createdAt,
    }).from(partnerCommissionsTable)
      .where(eq(partnerCommissionsTable.partnerId, auth.partnerId))
      .orderBy(desc(partnerCommissionsTable.createdAt))
      .limit(100);
    if (!commissions.length) { res.json({ data: [] }); return; }
    const orderIds = [...new Set(commissions.map(c => c.orderId))];
    const orders = await db.select({
      id: storeOrdersTable.id,
      orderNumber: storeOrdersTable.orderNumber,
      customerName: storeOrdersTable.customerName,
      customerEmail: storeOrdersTable.customerEmail,
      totalAmount: storeOrdersTable.totalAmount,
      status: storeOrdersTable.status,
      paymentStatus: storeOrdersTable.paymentStatus,
      createdAt: storeOrdersTable.createdAt,
    }).from(storeOrdersTable).where(inArray(storeOrdersTable.id, orderIds));
    const orderMap = new Map(orders.map(o => [o.id, o]));
    const data = commissions.map(c => ({ ...c, order: orderMap.get(c.orderId) ?? null }));
    res.json({ data });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES  (Clerk auth, MANAGEMENT_ROLES)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/parceiros
router.get("/parceiros", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role as never)) { next(new ForbiddenError("Acesso restrito", "FORBIDDEN_ROLE")); return; }
    const partners = await db.select().from(partnersTable)
      .where(eq(partnersTable.tenantId, me.tenantId))
      .orderBy(desc(partnersTable.createdAt));
    res.json({ data: partners });
  } catch (err) { next(err); }
});

// POST /api/parceiros — admin creates a partner + sets initial password
router.post("/parceiros", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role as never)) { next(new ForbiddenError("Acesso restrito", "FORBIDDEN_ROLE")); return; }
    const body = z.object({
      name: z.string().min(1).max(200),
      email: z.string().email(),
      cnpj: z.string().max(20).nullable().optional(),
      slug: z.string().min(1).max(100).optional(),
      description: z.string().max(1000).nullable().optional(),
      phone: z.string().max(30).nullable().optional(),
      commissionPct: z.number().min(0).max(100).default(30),
      password: z.string().min(6),
    }).safeParse(req.body);
    if (!body.success) { next(new ValidationError(String(body.error.message))); return; }
    const slug = body.data.slug ?? body.data.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 80);
    const id = generateId();
    await db.insert(partnersTable).values({
      id,
      tenantId: me.tenantId,
      name: body.data.name,
      email: body.data.email.toLowerCase(),
      cnpj: body.data.cnpj ?? null,
      slug,
      description: body.data.description ?? null,
      phone: body.data.phone ?? null,
      commissionPct: body.data.commissionPct.toFixed(2),
      passwordHash: hashPassword(body.data.password),
      status: "active",
    });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

// GET /api/parceiros/:id
router.get("/parceiros/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role as never)) { next(new ForbiddenError("Acesso restrito", "FORBIDDEN_ROLE")); return; }
    const [partner] = await db.select({
      id: partnersTable.id,
      name: partnersTable.name,
      email: partnersTable.email,
      cnpj: partnersTable.cnpj,
      slug: partnersTable.slug,
      description: partnersTable.description,
      phone: partnersTable.phone,
      logo: partnersTable.logo,
      status: partnersTable.status,
      commissionPct: partnersTable.commissionPct,
      createdAt: partnersTable.createdAt,
    }).from(partnersTable)
      .where(and(eq(partnersTable.id, req.params.id!), eq(partnersTable.tenantId, me.tenantId)))
      .limit(1);
    if (!partner) { next(new NotFoundError("Parceiro não encontrado", "NOT_FOUND")); return; }
    res.json(partner);
  } catch (err) { next(err); }
});

// PUT /api/parceiros/:id
router.put("/parceiros/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role as never)) { next(new ForbiddenError("Acesso restrito", "FORBIDDEN_ROLE")); return; }
    const [existing] = await db.select({ id: partnersTable.id })
      .from(partnersTable)
      .where(and(eq(partnersTable.id, req.params.id!), eq(partnersTable.tenantId, me.tenantId)))
      .limit(1);
    if (!existing) { next(new NotFoundError("Parceiro não encontrado", "NOT_FOUND")); return; }
    const body = z.object({
      name: z.string().min(1).max(200).optional(),
      cnpj: z.string().max(20).nullable().optional(),
      description: z.string().max(1000).nullable().optional(),
      phone: z.string().max(30).nullable().optional(),
      status: z.enum(["pending", "active", "suspended"]).optional(),
      commissionPct: z.number().min(0).max(100).optional(),
      password: z.string().min(6).optional(),
    }).safeParse(req.body);
    if (!body.success) { next(new ValidationError(String(body.error.message))); return; }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.cnpj !== undefined) updates.cnpj = body.data.cnpj;
    if (body.data.description !== undefined) updates.description = body.data.description;
    if (body.data.phone !== undefined) updates.phone = body.data.phone;
    if (body.data.status !== undefined) updates.status = body.data.status;
    if (body.data.commissionPct !== undefined) updates.commissionPct = body.data.commissionPct.toFixed(2);
    if (body.data.password) updates.passwordHash = hashPassword(body.data.password);
    await db.update(partnersTable).set(updates).where(eq(partnersTable.id, existing.id));
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/parceiros/:id/products
router.get("/parceiros/:id/products", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role as never)) { next(new ForbiddenError("Acesso restrito", "FORBIDDEN_ROLE")); return; }
    const products = await db.select().from(partnerProductsTable)
      .where(and(eq(partnerProductsTable.partnerId, req.params.id!), eq(partnerProductsTable.tenantId, me.tenantId)))
      .orderBy(desc(partnerProductsTable.createdAt));
    res.json({ data: products });
  } catch (err) { next(err); }
});

// PUT /api/parceiros/:id/products/:pid — approve/reject listing
router.put("/parceiros/:id/products/:pid", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role as never)) { next(new ForbiddenError("Acesso restrito", "FORBIDDEN_ROLE")); return; }
    const body = z.object({
      status: z.enum(["pending", "active", "rejected"]),
    }).safeParse(req.body);
    if (!body.success) { next(new ValidationError(String(body.error.message))); return; }
    await db.update(partnerProductsTable)
      .set({ status: body.data.status, updatedAt: new Date() })
      .where(and(eq(partnerProductsTable.id, req.params.pid!), eq(partnerProductsTable.tenantId, me.tenantId)));
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/parceiros/commissions — monthly payout report
router.get("/parceiros/commissions", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role as never)) { next(new ForbiddenError("Acesso restrito", "FORBIDDEN_ROLE")); return; }
    const { period } = req.query;
    const currentPeriod = typeof period === "string" ? period : new Date().toISOString().slice(0, 7);

    const rows = await db
      .select({
        partnerId: partnerCommissionsTable.partnerId,
        partnerName: partnersTable.name,
        partnerEmail: partnersTable.email,
        grossAmount: sql<number>`SUM(${partnerCommissionsTable.grossAmount})::float`,
        partnerAmount: sql<number>`SUM(${partnerCommissionsTable.partnerAmount})::float`,
        agencyAmount: sql<number>`SUM(${partnerCommissionsTable.agencyAmount})::float`,
        pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${partnerCommissionsTable.status} = 'pending')::int`,
        paidCount: sql<number>`COUNT(*) FILTER (WHERE ${partnerCommissionsTable.status} = 'paid')::int`,
        orderCount: sql<number>`COUNT(*)::int`,
      })
      .from(partnerCommissionsTable)
      .innerJoin(partnersTable, eq(partnersTable.id, partnerCommissionsTable.partnerId))
      .where(and(eq(partnerCommissionsTable.tenantId, me.tenantId), eq(partnerCommissionsTable.period, currentPeriod)))
      .groupBy(partnerCommissionsTable.partnerId, partnersTable.name, partnersTable.email);

    if (req.query["export"] === "csv") {
      const sanitize = (v: string | null | undefined) => {
        const s = String(v ?? "");
        const e = s.replace(/"/g, '""');
        return /^[=+\-@\t]/.test(e) ? `"'${e}"` : `"${e}"`;
      };
      const lines = [
        `RELATÓRIO DE REPASSES — ${currentPeriod}`,
        "Parceiro,Email,Pedidos,Bruto,Repasse Parceiro,Receita Agência,Pendente,Pago",
        ...rows.map(r =>
          `${sanitize(r.partnerName)},${sanitize(r.partnerEmail)},${r.orderCount},${Number(r.grossAmount).toFixed(2)},${Number(r.partnerAmount).toFixed(2)},${Number(r.agencyAmount).toFixed(2)},${r.pendingCount > 0 ? "Sim" : "Não"},${r.paidCount > 0 ? "Parcial" : "Não"}`
        ),
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="repasses-${currentPeriod}.csv"`);
      res.send("\uFEFF" + lines.join("\r\n"));
      return;
    }

    res.json({ data: rows, period: currentPeriod });
  } catch (err) { next(err); }
});

// PUT /api/parceiros/commissions/:id/mark-paid — mark a commission as paid
router.put("/parceiros/commissions/:id/mark-paid", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role as never)) { next(new ForbiddenError("Acesso restrito", "FORBIDDEN_ROLE")); return; }
    await db.update(partnerCommissionsTable)
      .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(partnerCommissionsTable.id, req.params.id!), eq(partnerCommissionsTable.tenantId, me.tenantId)));
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
