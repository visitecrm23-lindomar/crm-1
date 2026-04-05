import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, notesTable, usersTable } from "@workspace/db";
import { eq, and, ilike, or, sql, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import {
  CreateClientBody,
  UpdateClientBody,
  UpdateClientPipelineStageBody,
  CreateClientNoteBody,
} from "@workspace/api-zod";

const router = Router();

async function getTenantInfo(req: any) {
  const auth = req.auth;
  if (!auth?.userId) return null;
  const [me] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
  return me;
}

function formatClient(c: any) {
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
  };
}

router.get("/clients", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json({ data: [], total: 0, page: 1, limit: 20 }); return; }

    const { search, status, pipelineStage, classification, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let conditions = [eq(clientsTable.tenantId, me.tenantId)];
    if (search) {
      conditions.push(or(
        ilike(clientsTable.name, `%${search}%`),
        ilike(clientsTable.email, `%${search}%`),
        ilike(clientsTable.whatsapp, `%${search}%`),
      ) as any);
    }
    if (status) conditions.push(eq(clientsTable.status, status));
    if (pipelineStage) conditions.push(eq(clientsTable.pipelineStage, pipelineStage));
    if (classification) conditions.push(eq(clientsTable.classification, classification));

    const clients = await db.select().from(clientsTable)
      .where(and(...conditions))
      .orderBy(desc(clientsTable.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(clientsTable).where(and(...conditions));

    res.json({
      data: clients.map(formatClient),
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
    const me = await getTenantInfo(req);
    if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateClientBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const id = generateId();
    await db.insert(clientsTable).values({
      id,
      tenantId: me.tenantId ?? "default-tenant",
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
      createdById: me.id,
    });

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
    res.status(201).json(formatClient(client));
  } catch (err) {
    req.log.error({ err }, "Error creating client");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatClient(client));
  } catch (err) {
    req.log.error({ err }, "Error fetching client");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = UpdateClientBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: any = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.email != null) updates.email = parsed.data.email;
    if (parsed.data.whatsapp != null) updates.whatsapp = parsed.data.whatsapp;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
    if (parsed.data.cpf !== undefined) updates.cpf = parsed.data.cpf;
    if (parsed.data.birthDate !== undefined) updates.birthDate = parsed.data.birthDate ? new Date(parsed.data.birthDate) : null;
    if (parsed.data.gender !== undefined) updates.gender = parsed.data.gender;
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.classification != null) updates.classification = parsed.data.classification;
    if (parsed.data.tags != null) updates.tags = parsed.data.tags;
    if (parsed.data.observations !== undefined) updates.observations = parsed.data.observations;
    if (parsed.data.dreamDestinations != null) updates.dreamDestinations = parsed.data.dreamDestinations;
    if (parsed.data.addressCity !== undefined) updates.addressCity = parsed.data.addressCity;
    if (parsed.data.addressState !== undefined) updates.addressState = parsed.data.addressState;
    if (parsed.data.npsScore !== undefined) updates.npsScore = parsed.data.npsScore;
    if (parsed.data.pipelineStage != null) updates.pipelineStage = parsed.data.pipelineStage;
    if (parsed.data.lastContactAt !== undefined) updates.lastContactAt = parsed.data.lastContactAt ? new Date(parsed.data.lastContactAt) : null;
    if (parsed.data.photoUrl !== undefined) updates.photoUrl = parsed.data.photoUrl;

    await db.update(clientsTable).set(updates)
      .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)));

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, req.params.id)).limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatClient(client));
  } catch (err) {
    req.log.error({ err }, "Error updating client");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
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
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = UpdateClientPipelineStageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(clientsTable).set({ pipelineStage: parsed.data.stage })
      .where(and(eq(clientsTable.id, req.params.id), eq(clientsTable.tenantId, me.tenantId)));
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, req.params.id)).limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatClient(client));
  } catch (err) {
    req.log.error({ err }, "Error updating pipeline stage");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clients/:clientId/notes", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, req.params.clientId), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
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
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, req.params.clientId), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
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
    const [note] = await db.select().from(notesTable).where(eq(notesTable.id, id)).limit(1);
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
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, req.params.clientId), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(notesTable).where(eq(notesTable.id, req.params.noteId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting note");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
