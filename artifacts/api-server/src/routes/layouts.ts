import { Router } from "express";
import { db } from "@workspace/db";
import { vehicleLayoutsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import type { LayoutCell } from "@workspace/db";
import { CreateLayoutBody, UpdateLayoutBody } from "@workspace/api-zod";
import { ADMIN_ROLES } from '../lib/tenant';

const router = Router();

function countSeats(cells: LayoutCell[]): number {
  return cells.filter(c => c.type === "seat" || c.type === "vip" || c.type === "accessible").length;
}

function formatLayout(l: typeof vehicleLayoutsTable.$inferSelect) {
  const cells = (l.cells ?? []) as LayoutCell[];
  return {
    id: l.id,
    tenantId: l.tenantId,
    name: l.name,
    description: l.description ?? null,
    vehicleType: l.vehicleType ?? null,
    rows: l.rows,
    cols: l.cols,
    floors: l.floors,
    numberingType: l.numberingType,
    cells,
    seatCount: countSeats(cells),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

router.get("/layouts", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const layouts = await db.select().from(vehicleLayoutsTable)
      .where(eq(vehicleLayoutsTable.tenantId, me.tenantId))
      .orderBy(desc(vehicleLayoutsTable.createdAt));

    res.json(layouts.map(formatLayout));
  } catch (err) {
    req.log.error({ err }, "Error listing layouts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/layouts", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const parsed = CreateLayoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const { name, description, vehicleType, rows, cols, floors, numberingType, cells } = parsed.data;

    const id = generateId();
    await db.insert(vehicleLayoutsTable).values({
      id,
      tenantId: me.tenantId,
      name,
      description: description ?? null,
      vehicleType: vehicleType ?? null,
      rows,
      cols,
      floors: floors ?? 1,
      numberingType: numberingType ?? "sequential",
      cells: cells as LayoutCell[],
    });

    const [layout] = await db.select().from(vehicleLayoutsTable)
      .where(and(eq(vehicleLayoutsTable.id, id), eq(vehicleLayoutsTable.tenantId, me.tenantId)))
      .limit(1);

    if (!layout) { res.status(500).json({ error: "Failed to create layout" }); return; }
    res.status(201).json(formatLayout(layout));
  } catch (err) {
    req.log.error({ err }, "Error creating layout");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/layouts/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const [layout] = await db.select().from(vehicleLayoutsTable)
      .where(and(eq(vehicleLayoutsTable.id, req.params.id), eq(vehicleLayoutsTable.tenantId, me.tenantId)))
      .limit(1);

    if (!layout) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatLayout(layout));
  } catch (err) {
    req.log.error({ err }, "Error fetching layout");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/layouts/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [existing] = await db.select().from(vehicleLayoutsTable)
      .where(and(eq(vehicleLayoutsTable.id, req.params.id), eq(vehicleLayoutsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const parsed = UpdateLayoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const { name, description, vehicleType, rows, cols, floors, numberingType, cells } = parsed.data;

    const updates: Partial<typeof vehicleLayoutsTable.$inferInsert> = {};
    if (name != null) updates.name = name;
    if (description !== undefined) updates.description = description ?? null;
    if (vehicleType !== undefined) updates.vehicleType = vehicleType ?? null;
    if (rows != null) updates.rows = rows;
    if (cols != null) updates.cols = cols;
    if (floors != null) updates.floors = floors;
    if (numberingType != null) updates.numberingType = numberingType;
    if (cells != null) updates.cells = cells as LayoutCell[];

    await db.update(vehicleLayoutsTable).set(updates)
      .where(and(eq(vehicleLayoutsTable.id, req.params.id), eq(vehicleLayoutsTable.tenantId, me.tenantId)));

    const [layout] = await db.select().from(vehicleLayoutsTable)
      .where(and(eq(vehicleLayoutsTable.id, req.params.id), eq(vehicleLayoutsTable.tenantId, me.tenantId)))
      .limit(1);

    if (!layout) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatLayout(layout));
  } catch (err) {
    req.log.error({ err }, "Error updating layout");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/layouts/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await db.delete(vehicleLayoutsTable)
      .where(and(eq(vehicleLayoutsTable.id, req.params.id), eq(vehicleLayoutsTable.tenantId, me.tenantId)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting layout");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
