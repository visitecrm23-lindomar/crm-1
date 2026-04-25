import { Router } from "express";
import { db, documentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { ADMIN_ROLES } from '../lib/tenant';

const router = Router();

const CreateDocumentBody = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  url: z.string().url(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

router.get("/documents", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const documents = await db.select().from(documentsTable)
      .where(eq(documentsTable.tenantId, me.tenantId))
      .orderBy(desc(documentsTable.createdAt));
    res.json(documents);
  } catch (err) {
    req.log.error({ err }, "Error listing documents");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateDocumentBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(documentsTable).values({ id, tenantId: me.tenantId, uploadedById: me.id, ...parsed.data });
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id)).limit(1);
    res.status(201).json(doc);
  } catch (err) {
    req.log.error({ err }, "Error creating document");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [doc] = await db.select().from(documentsTable)
      .where(and(eq(documentsTable.id, req.params.id), eq(documentsTable.tenantId, me.tenantId))).limit(1);
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (doc.uploadedById !== me.id && !ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    await db.delete(documentsTable)
      .where(and(eq(documentsTable.id, req.params.id), eq(documentsTable.tenantId, me.tenantId)));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting document");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
