import { Router } from "express";
import { db, boardingLocationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { ADMIN_ROLES } from '../lib/tenant';

const router = Router();

const CreateBoardingLocationBody = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  reference: z.string().optional(),
  departureTime: z.string().optional(),
});

router.get("/boarding-locations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const locations = await db.select().from(boardingLocationsTable)
      .where(eq(boardingLocationsTable.tenantId, me.tenantId))
      .orderBy(desc(boardingLocationsTable.createdAt));
    res.json(locations);
  } catch (err) {
    req.log.error({ err }, "Error listing boarding locations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/boarding-locations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateBoardingLocationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(boardingLocationsTable).values({ id, tenantId: me.tenantId, ...parsed.data });
    const [loc] = await db.select().from(boardingLocationsTable).where(eq(boardingLocationsTable.id, id)).limit(1);
    res.status(201).json(loc);
  } catch (err) {
    req.log.error({ err }, "Error creating boarding location");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/boarding-locations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateBoardingLocationBody.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(boardingLocationsTable).set(parsed.data)
      .where(and(eq(boardingLocationsTable.id, req.params.id), eq(boardingLocationsTable.tenantId, me.tenantId)));
    const [loc] = await db.select().from(boardingLocationsTable)
      .where(and(eq(boardingLocationsTable.id, req.params.id), eq(boardingLocationsTable.tenantId, me.tenantId))).limit(1);
    if (!loc) { res.status(404).json({ error: "Not found" }); return; }
    res.json(loc);
  } catch (err) {
    req.log.error({ err }, "Error updating boarding location");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/boarding-locations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(boardingLocationsTable)
      .where(and(eq(boardingLocationsTable.id, req.params.id), eq(boardingLocationsTable.tenantId, me.tenantId)));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting boarding location");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
