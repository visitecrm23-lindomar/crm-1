import { Router, type NextFunction } from "express";
import { AppError } from "../lib/errors";
import { db } from "@workspace/db";
import { clientsTable, notesTable, reservationsTable, tripsTable, npsResponsesTable, referralsTable } from "@workspace/db";
import { eq, and, ilike, or, sql, desc, inArray } from "drizzle-orm";
import { generateId, generateReferralCode } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { validateCPF, cleanCPF } from "../lib/cpf";
import { checkPlanLimit } from "../lib/planLimits";
import {
  CreateClientBody,
  UpdateClientBody,
  UpdateClientPipelineStageBody,
  CreateClientNoteBody,
} from "@workspace/api-zod";
import { CalendarSyncService } from "../lib/google-calendar/sync-service";
import { ADMIN_ROLES } from '../lib/tenant';

const router = Router();

function formatClient(c: typeof clientsTable.$inferSelect, extra?: { isNew?: boolean; message?: string }) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    whatsapp: c.whatsapp,
    phone: c.phone,
    cpf: c.cpf,
    rg: c.rg,
    birthDate: c.birthDate?.toISOString() ?? null,
    gender: c.gender,
    photoUrl: c.photoUrl,
    instagram: c.instagram,
    addressCity: c.addressCity,
    addressState: c.addressState,
    classification: c.classification,
    status: c.status,
    tags: c.tags ?? [],
    pipelineStage: c.pipelineStage,
    totalSpent: Number(c.totalSpent),
    outstandingBalance: Number(c.outstandingBalance),
    npsScore: c.npsScore,
    observations: c.observations,
    dreamDestinations: c.dreamDestinations ?? [],
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    lastContactAt: c.lastContactAt?.toISOString() ?? null,
    origin: c.origin ?? null,
    maritalStatus: c.maritalStatus ?? null,
    professionalArea: c.professionalArea ?? null,
    favoriteDrink: c.favoriteDrink ?? null,
    companyFeedback: c.companyFeedback ?? null,
    musicalPreferences: c.musicalPreferences ?? null,
    foodPreferences: c.foodPreferences ?? null,
    internalRating: c.internalRating ?? null,
    companyNps: c.companyNps ?? null,
    isNew: extra?.isNew ?? null,
    message: extra?.message ?? null,
  };
}

router.get("/clients", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const {
      search, status, pipelineStage, classification,
      city, tripId, sellerId, origin, dateFrom, dateTo, sortBy = "createdAt", sortOrder = "desc",
      page = "1", limit = "20",
    } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    if (me.role === "cliente") {
      const [clientRecord] = await db.select().from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.userId, me.id)))
        .limit(1);
      if (!clientRecord) {
        res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
        return;
      }
      res.json({
        data: [{ ...formatClient(clientRecord), lastTripName: null }],
        total: 1, page: pageNum, limit: limitNum,
      });
      return;
    }

    const conditions: ReturnType<typeof eq>[] = [eq(clientsTable.tenantId, me.tenantId)];

    if (me.role === "vendedor") {
      conditions.push(eq(clientsTable.createdById, me.id));
    }

    if (search) {
      const searchClean = cleanCPF(search);
      conditions.push(or(
        ilike(clientsTable.name, `%${search}%`),
        ilike(clientsTable.email, `%${search}%`),
        ilike(clientsTable.whatsapp, `%${search}%`),
        searchClean.length >= 3 ? ilike(clientsTable.cpf, `%${searchClean}%`) : undefined,
      ) as ReturnType<typeof eq>);
    }
    if (status) conditions.push(eq(clientsTable.status, status));
    if (pipelineStage) conditions.push(eq(clientsTable.pipelineStage, pipelineStage));
    if (classification) conditions.push(eq(clientsTable.classification, classification));
    if (city) conditions.push(ilike(clientsTable.addressCity, `%${city}%`) as ReturnType<typeof eq>);
    if (origin) conditions.push(ilike(clientsTable.origin, `%${origin}%`) as ReturnType<typeof eq>);
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (dateFrom && !ISO_DATE.test(dateFrom)) { res.status(400).json({ error: "dateFrom must be a valid ISO date (YYYY-MM-DD)" }); return; }
    if (dateTo && !ISO_DATE.test(dateTo)) { res.status(400).json({ error: "dateTo must be a valid ISO date (YYYY-MM-DD)" }); return; }
    if (dateFrom) conditions.push(sql`${clientsTable.createdAt} >= ${new Date(dateFrom)}` as ReturnType<typeof eq>);
    if (dateTo) conditions.push(sql`${clientsTable.createdAt} <= ${new Date(dateTo)}` as ReturnType<typeof eq>);
    if (me.role !== "vendedor" && sellerId) conditions.push(eq(clientsTable.createdById, sellerId));
    if (tripId) {
      const clientIdsInTrip = await db.selectDistinct({ clientId: reservationsTable.clientId })
        .from(reservationsTable)
        .where(and(eq(reservationsTable.tripId, tripId), eq(reservationsTable.tenantId, me.tenantId)));
      const ids = clientIdsInTrip.map(r => r.clientId);
      conditions.push(ids.length > 0 ? inArray(clientsTable.id, ids) : sql`false` as ReturnType<typeof eq>);
    }

    const orderCol = sortBy === "name" ? clientsTable.name
      : sortBy === "totalSpent" ? clientsTable.totalSpent
      : sortBy === "createdAt" ? clientsTable.createdAt
      : clientsTable.createdAt;
    const orderDir = sortOrder === "asc" ? orderCol : desc(orderCol);

    const clients = await db.select().from(clientsTable)
      .where(and(...conditions))
      .orderBy(orderDir)
      .limit(limitNum)
      .offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(clientsTable).where(and(...conditions));

    const clientIds = clients.map(c => c.id);
    let lastTripMap: Record<string, string> = {};
    if (clientIds.length > 0) {
      const lastTrips = await db.select({
        clientId: reservationsTable.clientId,
        tripName: tripsTable.name,
        createdAt: reservationsTable.createdAt,
      })
        .from(reservationsTable)
        .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
        .where(and(eq(reservationsTable.tenantId, me.tenantId), inArray(reservationsTable.clientId, clientIds)))
        .orderBy(desc(reservationsTable.createdAt));
      for (const row of lastTrips) {
        if (!lastTripMap[row.clientId]) lastTripMap[row.clientId] = row.tripName;
      }
    }

    res.json({
      data: clients.map(c => ({ ...formatClient(c), lastTripName: lastTripMap[c.id] ?? null })),
      total: Number(countResult?.count ?? 0),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/clients", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.tenantId) {
      const allowed = await checkPlanLimit(me.tenantId, "clients", req, res);
      if (!allowed) return;
    }
    const parsed = CreateClientBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    let cleanedCpf: string;
    try {
      cleanedCpf = validateCPF(parsed.data.cpf);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "CPF inválido" });
      return;
    }

    const sharedFields = {
      name: parsed.data.name,
      email: parsed.data.email,
      whatsapp: parsed.data.whatsapp,
      phone: parsed.data.phone ?? null,
      rg: parsed.data.rg ?? null,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      gender: parsed.data.gender ?? null,
      photoUrl: parsed.data.photoUrl ?? null,
      instagram: parsed.data.instagram ?? null,
      addressCity: parsed.data.addressCity ?? null,
      addressState: parsed.data.addressState ?? null,
      observations: parsed.data.observations ?? null,
      tags: parsed.data.tags ?? [],
      dreamDestinations: parsed.data.dreamDestinations ?? [],
      origin: parsed.data.origin ?? null,
      maritalStatus: parsed.data.maritalStatus ?? null,
      professionalArea: parsed.data.professionalArea ?? null,
      favoriteDrink: parsed.data.favoriteDrink ?? null,
      companyFeedback: parsed.data.companyFeedback ?? null,
      musicalPreferences: parsed.data.musicalPreferences ?? null,
      foodPreferences: parsed.data.foodPreferences ?? null,
      internalRating: parsed.data.internalRating ?? null,
      companyNps: parsed.data.companyNps ?? null,
    };

    const id = generateId();
    const [upserted] = await db.insert(clientsTable)
      .values({
        id,
        tenantId: me.tenantId,
        cpf: cleanedCpf,
        ...sharedFields,
        createdById: me.id,
      })
      .onConflictDoUpdate({
        target: [clientsTable.tenantId, clientsTable.cpf],
        targetWhere: sql`${clientsTable.cpf} IS NOT NULL`,
        set: { ...sharedFields, updatedAt: new Date() },
      })
      .returning();

    if (!upserted) { next(new AppError("Failed to create client", 500, "CLIENT_CREATE_FAILED")); return; }

    const isNew = upserted.id === id;
    const message = isNew ? "Cliente cadastrado com sucesso." : "Cliente já cadastrado — dados atualizados.";
    const statusCode = isNew ? 201 : 200;
    res.status(statusCode).json(formatClient(upserted, { isNew, message }));

    if (upserted.birthDate) {
      CalendarSyncService.syncBirthday(upserted.id).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

async function requireClientAccess(
  me: { id: string; tenantId: string; role: string },
  clientId: string,
  res: import("express").Response,
): Promise<typeof clientsTable.$inferSelect | null> {
  const conditions: ReturnType<typeof eq>[] = [eq(clientsTable.id, clientId), eq(clientsTable.tenantId, me.tenantId)];
  if (me.role === "cliente") conditions.push(eq(clientsTable.userId, me.id));
  else if (me.role === "vendedor") conditions.push(eq(clientsTable.createdById, me.id));
  const [client] = await db.select().from(clientsTable).where(and(...conditions)).limit(1);
  if (!client) { res.status(404).json({ error: "Not found" }); return null; }
  return client;
}

router.get("/clients/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const client = await requireClientAccess(me, req.params.id, res);
    if (!client) return;
    res.json(formatClient(client));
  } catch (err) {
    next(err);
  }
});

router.patch("/clients/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === "cliente") { res.status(403).json({ error: "Forbidden" }); return; }
    const existing = await requireClientAccess(me, req.params.id, res);
    if (!existing) return;

    const parsed = UpdateClientBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Partial<typeof clientsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.email != null) updates.email = parsed.data.email;
    if (parsed.data.whatsapp != null) updates.whatsapp = parsed.data.whatsapp;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone ?? null;
    if (parsed.data.cpf != null) {
      try { updates.cpf = validateCPF(parsed.data.cpf); } catch { res.status(400).json({ error: "CPF inválido" }); return; }
    }
    if (parsed.data.rg !== undefined) updates.rg = parsed.data.rg ?? null;
    if (parsed.data.birthDate !== undefined) updates.birthDate = parsed.data.birthDate ? new Date(parsed.data.birthDate) : null;
    if (parsed.data.gender !== undefined) updates.gender = parsed.data.gender ?? null;
    if (parsed.data.instagram !== undefined) updates.instagram = parsed.data.instagram ?? null;
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.classification != null) updates.classification = parsed.data.classification;
    if (parsed.data.tags != null) updates.tags = parsed.data.tags;
    if (parsed.data.observations !== undefined) updates.observations = parsed.data.observations ?? null;
    if (parsed.data.dreamDestinations != null) updates.dreamDestinations = parsed.data.dreamDestinations;
    if (parsed.data.addressCity !== undefined) updates.addressCity = parsed.data.addressCity ?? null;
    if (parsed.data.addressState !== undefined) updates.addressState = parsed.data.addressState ?? null;
    if (parsed.data.npsScore !== undefined) updates.npsScore = parsed.data.npsScore ?? null;
    if (parsed.data.pipelineStage != null) updates.pipelineStage = parsed.data.pipelineStage;
    if (parsed.data.lastContactAt !== undefined) updates.lastContactAt = parsed.data.lastContactAt ? new Date(parsed.data.lastContactAt) : null;
    if (parsed.data.photoUrl !== undefined) updates.photoUrl = parsed.data.photoUrl ?? null;
    if (parsed.data.instagram !== undefined) updates.instagram = parsed.data.instagram ?? null;
    if (parsed.data.origin !== undefined) updates.origin = parsed.data.origin ?? null;
    if (parsed.data.maritalStatus !== undefined) updates.maritalStatus = parsed.data.maritalStatus ?? null;
    if (parsed.data.professionalArea !== undefined) updates.professionalArea = parsed.data.professionalArea ?? null;
    if (parsed.data.favoriteDrink !== undefined) updates.favoriteDrink = parsed.data.favoriteDrink ?? null;
    if (parsed.data.companyFeedback !== undefined) updates.companyFeedback = parsed.data.companyFeedback ?? null;
    if (parsed.data.musicalPreferences !== undefined) updates.musicalPreferences = parsed.data.musicalPreferences ?? null;
    if (parsed.data.foodPreferences !== undefined) updates.foodPreferences = parsed.data.foodPreferences ?? null;
    if (parsed.data.internalRating !== undefined) updates.internalRating = parsed.data.internalRating ?? null;
    if (parsed.data.companyNps !== undefined) {
      updates.companyNps = parsed.data.companyNps ?? null;
      updates.npsScore = parsed.data.companyNps ?? null;
    }

    await db.transaction(async (tx) => {
      await tx.update(clientsTable).set(updates)
        .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)));

      if (parsed.data.companyNps != null) {
        const score = parsed.data.companyNps;
        const classification = score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
        const npsUserId = existing.userId ?? existing.id;
        await tx.insert(npsResponsesTable).values({
          id: generateId(),
          tenantId: me.tenantId,
          userId: npsUserId,
          score,
          classification,
          feedback: null,
          orderId: null,
        });
      }
    });

    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatClient(client));

    if (parsed.data.birthDate !== undefined) {
      CalendarSyncService.syncBirthday(client.id).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

router.delete("/clients/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(clientsTable)
      .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/clients/:id/pipeline-stage", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === "cliente") { res.status(403).json({ error: "Forbidden" }); return; }
    const existing = await requireClientAccess(me, req.params.id, res);
    if (!existing) return;

    const parsed = UpdateClientPipelineStageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(clientsTable).set({ pipelineStage: parsed.data.stage })
      .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)));
    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatClient(client));
  } catch (err) {
    next(err);
  }
});

router.get("/clients/:clientId/activities", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const client = await requireClientAccess(me, req.params.clientId, res);
    if (!client) return;
    const activities = await db.select().from(notesTable)
      .where(eq(notesTable.clientId, req.params.clientId))
      .orderBy(desc(notesTable.createdAt));
    res.json(activities.map(n => ({
      id: n.id, clientId: n.clientId, type: n.type,
      content: n.content,
      metadata: n.metadata ? (() => { try { return JSON.parse(n.metadata!); } catch { return null; } })() : null,
      isPrivate: n.isPrivate, createdById: n.createdById,
      createdAt: n.createdAt.toISOString(),
    })));
  } catch (err) {
    next(err);
  }
});

router.post("/clients/:clientId/activities", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const client = await requireClientAccess(me, req.params.clientId, res);
    if (!client) return;
    const { type, content, metadata } = req.body as { type?: string; content?: string; metadata?: Record<string, unknown> | null };
    if (!type || !content) { res.status(400).json({ error: "type and content are required" }); return; }
    const MANUAL_ACTIVITY_TYPES = ["note", "call", "whatsapp", "email", "meeting"];
    if (!MANUAL_ACTIVITY_TYPES.includes(type)) {
      res.status(400).json({ error: `Invalid activity type. Must be one of: ${MANUAL_ACTIVITY_TYPES.join(", ")}` });
      return;
    }
    const id = generateId();
    await db.insert(notesTable).values({
      id,
      clientId: req.params.clientId,
      type,
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
      isPrivate: false,
      createdById: me.id,
    });
    const [activity] = await db.select().from(notesTable)
      .where(and(eq(notesTable.id, id), eq(notesTable.clientId, req.params.clientId)))
      .limit(1);
    if (!activity) { next(new AppError("Failed to create activity", 500, "ACTIVITY_CREATE_FAILED")); return; }
    res.status(201).json({
      id: activity.id, clientId: activity.clientId, type: activity.type,
      content: activity.content,
      metadata: activity.metadata ? (() => { try { return JSON.parse(activity.metadata!); } catch { return null; } })() : null,
      isPrivate: activity.isPrivate, createdById: activity.createdById,
      createdAt: activity.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/clients/:clientId/notes", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const client = await requireClientAccess(me, req.params.clientId, res);
    if (!client) return;
    const notes = await db.select().from(notesTable)
      .where(eq(notesTable.clientId, req.params.clientId))
      .orderBy(desc(notesTable.createdAt));
    res.json(notes.map(n => ({
      id: n.id, clientId: n.clientId, content: n.content,
      isPrivate: n.isPrivate, createdById: n.createdById,
      createdAt: n.createdAt.toISOString(),
    })));
  } catch (err) {
    next(err);
  }
});

router.post("/clients/:clientId/notes", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const client = await requireClientAccess(me, req.params.clientId, res);
    if (!client) return;
    const parsed = CreateClientNoteBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(notesTable).values({
      id,
      clientId: req.params.clientId,
      content: parsed.data.content,
      isPrivate: parsed.data.isPrivate ?? false,
      createdById: me.id,
    });
    const [note] = await db.select().from(notesTable)
      .where(and(eq(notesTable.id, id), eq(notesTable.clientId, req.params.clientId)))
      .limit(1);
    if (!note) { next(new AppError("Failed to create note", 500, "NOTE_CREATE_FAILED")); return; }
    res.status(201).json({
      id: note.id, clientId: note.clientId, content: note.content,
      isPrivate: note.isPrivate, createdById: note.createdById,
      createdAt: note.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/clients/:clientId/notes/:noteId", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const client = await requireClientAccess(me, req.params.clientId, res);
    if (!client) return;
    await db.delete(notesTable)
      .where(and(eq(notesTable.id, req.params.noteId), eq(notesTable.clientId, req.params.clientId)));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/clients/:clientId/referral", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const client = await requireClientAccess(me, req.params.clientId, res);
    if (!client) return;
    const referrals = await db.select().from(referralsTable)
      .where(and(
        eq(referralsTable.tenantId, me.tenantId),
        eq(referralsTable.referrerId, req.params.clientId),
      ))
      .orderBy(desc(referralsTable.createdAt));
    res.json({
      referralCode: client.referralCode ?? null,
      totalReferrals: client.totalReferrals ?? 0,
      successfulReferrals: client.successfulReferrals ?? 0,
      referralEarnings: Number(client.referralEarnings ?? 0),
      referrals,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/clients/:clientId/referral/generate", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const client = await requireClientAccess(me, req.params.clientId, res);
    if (!client) return;

    // If client already has a code return it
    if (client.referralCode) {
      res.json({ code: client.referralCode });
      return;
    }

    // Generate unique referral code using utility: NOME2026 format (tenant-scoped uniqueness)
    const baseCode = generateReferralCode(client.name ?? "REF", me.tenantId);
    const namePart = baseCode.replace(/\d+$/, "");
    const year = new Date().getFullYear();
    let code = baseCode;

    // Unlimited loop until a unique code is found within this tenant
    let attempt = 0;
    while (true) {
      const candidate = attempt === 0 ? code : `${namePart}${year}${attempt}`;
      const [existing] = await db.select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(
          eq(clientsTable.tenantId, me.tenantId),
          eq(clientsTable.referralCode, candidate),
        )).limit(1);
      if (!existing) { code = candidate; break; }
      attempt++;
    }

    const generatedAt = new Date();
    await db.update(clientsTable)
      .set({ referralCode: code, referralCodeGeneratedAt: generatedAt })
      .where(eq(clientsTable.id, client.id));

    res.json({ code });
  } catch (err) {
    next(err);
  }
});

export default router;
