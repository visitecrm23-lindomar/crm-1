import { Router } from "express";
import { db, platformSettingsTable, redisAlertLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";
import { generateId } from "../lib/id";
import { ROLES } from "@workspace/permissions";

const router = Router();

router.get("/admin/platform-settings", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.SUPER_ADMIN) { res.status(403).json({ error: "Forbidden" }); return; }

    const settings = await db.select().from(platformSettingsTable).orderBy(platformSettingsTable.key);
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Error fetching platform settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/platform-settings/:key", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.SUPER_ADMIN) { res.status(403).json({ error: "Forbidden" }); return; }

    const { key } = req.params;
    const { value } = req.body;

    if (key === "redis_alert_email" && value !== null && value !== undefined && String(value).trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(value).trim())) {
        res.status(400).json({ error: "Endereço de e-mail inválido" });
        return;
      }
    }

    const existing = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key)).limit(1);

    if (existing.length === 0) {
      res.status(404).json({ error: "Setting not found" });
      return;
    }

    const [updated] = await db
      .update(platformSettingsTable)
      .set({ value: value !== undefined ? String(value) : null })
      .where(eq(platformSettingsTable.key, key))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating platform setting");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/redis-alert-log", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.SUPER_ADMIN) { res.status(403).json({ error: "Forbidden" }); return; }

    const logs = await db
      .select()
      .from(redisAlertLogTable)
      .orderBy(desc(redisAlertLogTable.triggeredAt))
      .limit(20);

    res.json(logs);
  } catch (err) {
    req.log.error({ err }, "Error fetching redis alert log");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
