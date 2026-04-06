import { Router } from "express";
import { db } from "@workspace/db";
import { systemConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";

const router = Router();

const UpsertSystemConfigBody = z.object({
  key: z.string().min(1),
  value: z.record(z.string(), z.unknown()).nullable().optional(),
});

router.get("/system-configs", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const configs = await db
      .select()
      .from(systemConfigsTable)
      .where(eq(systemConfigsTable.tenantId, me.tenantId));
    res.json(configs);
  } catch (err) {
    req.log.error({ err }, "Error listing system configs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/system-configs", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = UpsertSystemConfigBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { key, value } = parsed.data;
    const [existing] = await db
      .select()
      .from(systemConfigsTable)
      .where(
        and(
          eq(systemConfigsTable.tenantId, me.tenantId),
          eq(systemConfigsTable.key, key),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(systemConfigsTable)
        .set({ value: value ?? null, updatedById: me.id })
        .where(eq(systemConfigsTable.id, existing.id));
      const [updated] = await db
        .select()
        .from(systemConfigsTable)
        .where(eq(systemConfigsTable.id, existing.id))
        .limit(1);
      res.json(updated);
    } else {
      const id = generateId();
      await db.insert(systemConfigsTable).values({
        id,
        tenantId: me.tenantId,
        key,
        value: value ?? null,
        updatedById: me.id,
      });
      const [created] = await db
        .select()
        .from(systemConfigsTable)
        .where(eq(systemConfigsTable.id, id))
        .limit(1);
      res.status(201).json(created);
    }
  } catch (err) {
    req.log.error({ err }, "Error upserting system config");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
