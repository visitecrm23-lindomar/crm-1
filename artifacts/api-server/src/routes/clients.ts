import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, notesTable, reservationsTable, tripsTable } from "@workspace/db";
import { eq, and, ilike, or, sql, desc, inArray } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import {
  CreateClientBody,
  UpdateClientBody,
  UpdateClientPipelineStageBody,
  CreateClientNoteBody,
} from "@workspace/api-zod";

const router = Router();

function formatClient(c: typeof clientsTable.$inferSelect) {
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
  };
}

router.get("/clients", async (req, res): Promise<void> => {
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
      conditions.push(or(
        ilike(clientsTable.name, `%${search}%`),
        ilike(clientsTable.email, `%${search}%`),
        ilike(clientsTable.whatsapp, `%${search}%`),
      ) as ReturnType<typeof eq>);
    }
    if (status) conditions.push(eq(clientsTable.status, status));
    if (pipelineStage) conditions.push(eq(clientsTable.pipelineStage, pipelineStage));
    if (classification) conditions.push(eq(clientsTable.classification, classification));
    if (city) conditions.push(ilike(clientsTable.addressCity, `%${city}%`) as ReturnType<typeof eq>);
    if (origin) conditions.push(ilike(clientsTable.origin, `%${origin}%`) as ReturnType<typeof eq>);
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
    req.log.error({ err }, "Error listing clients");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/clients", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateClientBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const id = generateId();
    await db.insert(clientsTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      email: parsed.data.email,
      whatsapp: parsed.data.whatsapp,
      phone: parsed.data.phone ?? null,
      cpf: parsed.data.cpf ?? null,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      gender: parsed.data.gender ?? null,
      photoUrl: parsed.data.photoUrl ?? null,
      addressCity: parsed.data.addressCity ?? null,
      addressState: parsed.data.addressState ?? null,
      observations: parsed.data.observations ?? null,
      tags: parsed.data.tags ?? [],
      dreamDestinations: parsed.data.dreamDestinations ?? [],
      origin: parsed.data.origin ?? null,
      createdById: me.id,
    });

    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, id), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { res.status(500).json({ error: "Failed to create client" }); return; }
    res.status(201).json(formatClient(client));
  } catch (err) {
    req.log.error({ err }, "Error creating client");
    res.status(500).json({ error: "Internal server error" });
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

router.get("/clients/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const client = await requireClientAccess(me, req.params.id, res);
    if (!client) return;
    res.json(formatClient(client));
  } catch (err) {
    req.log.error({ err }, "Error fetching client");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
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
    if (parsed.data.cpf !== undefined) updates.cpf = parsed.data.cpf ?? null;
    if (parsed.data.birthDate !== undefined) updates.birthDate = parsed.data.birthDate ? new Date(parsed.data.birthDate) : null;
    if (parsed.data.gender !== undefined) updates.gender = parsed.data.gender ?? null;
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
    if (parsed.data.origin !== undefined) updates.origin = parsed.data.origin ?? null;

    await db.update(clientsTable).set(updates)
      .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)));

    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatClient(client));
  } catch (err) {
    req.log.error({ err }, "Error updating client");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(clientsTable)
      .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting client");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/clients/:id/pipeline-stage", async (req, res): Promise<void> => {
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
    req.log.error({ err }, "Error updating pipeline stage");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clients/:clientId/notes", async (req, res): Promise<void> => {
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
    req.log.error({ err }, "Error listing notes");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/clients/:clientId/notes", async (req, res): Promise<void> => {
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
    if (!note) { res.status(500).json({ error: "Failed to create note" }); return; }
    res.status(201).json({
      id: note.id, clientId: note.clientId, content: note.content,
      isPrivate: note.isPrivate, createdById: note.createdById,
      createdAt: note.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error creating note");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/clients/:clientId/notes/:noteId", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const client = await requireClientAccess(me, req.params.clientId, res);
    if (!client) return;
    await db.delete(notesTable)
      .where(and(eq(notesTable.id, req.params.noteId), eq(notesTable.clientId, req.params.clientId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting note");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
