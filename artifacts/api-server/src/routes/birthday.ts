import { Router } from "express";
import { db, clientsTable, birthdayMessagesTable, couponsTable, systemConfigsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../lib/tenant";
import { generateId } from "../lib/id";
import { processBirthdayForClient, getBirthdaySettings } from "../lib/birthday";

const router = Router();
const ADMIN_ROLES = ["agencia", "superadmin"];

router.get("/birthday/today", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const year = today.getFullYear();

    const allClients = await db
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.tenantId, me.tenantId), sql`birth_date IS NOT NULL`));

    const todayBirthday = allClients.filter((c) => {
      const bd = c.birthDate!;
      return (bd.getMonth() + 1) === month && bd.getDate() === day;
    });

    const messages = await db
      .select()
      .from(birthdayMessagesTable)
      .where(
        and(
          eq(birthdayMessagesTable.tenantId, me.tenantId),
          eq(birthdayMessagesTable.birthdayYear, year)
        )
      );

    const msgByClient: Record<string, typeof messages[0]> = {};
    for (const m of messages) { msgByClient[m.clientId] = m; }

    const result = todayBirthday.map((c) => ({
      ...c,
      birthdayMessage: msgByClient[c.id] ?? null,
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing today birthdays");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/birthday/upcoming", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const days = Math.min(Number(req.query.days) || 7, 60);
    const today = new Date();
    const year = today.getFullYear();

    const allClients = await db
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.tenantId, me.tenantId), sql`birth_date IS NOT NULL`));

    const upcoming: Array<{ daysUntil: number; client: typeof allClients[0] }> = [];

    for (const c of allClients) {
      const bd = c.birthDate!;
      const thisYearBd = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
      let daysUntil = Math.ceil((thisYearBd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil < 0) {
        const nextYearBd = new Date(today.getFullYear() + 1, bd.getMonth(), bd.getDate());
        daysUntil = Math.ceil((nextYearBd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }
      if (daysUntil <= days && daysUntil > 0) {
        upcoming.push({ daysUntil, client: c });
      }
    }

    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

    const messages = await db
      .select()
      .from(birthdayMessagesTable)
      .where(
        and(
          eq(birthdayMessagesTable.tenantId, me.tenantId),
          eq(birthdayMessagesTable.birthdayYear, year)
        )
      );
    const msgByClient: Record<string, typeof messages[0]> = {};
    for (const m of messages) { msgByClient[m.clientId] = m; }

    const result = upcoming.map(({ daysUntil, client: c }) => ({
      ...c,
      daysUntil,
      birthdayMessage: msgByClient[c.id] ?? null,
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing upcoming birthdays");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/birthday/history", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const year = req.query.year ? Number(req.query.year) : undefined;

    const conditions = [eq(birthdayMessagesTable.tenantId, me.tenantId)];
    if (year) conditions.push(eq(birthdayMessagesTable.birthdayYear, year));

    const messages = await db
      .select()
      .from(birthdayMessagesTable)
      .where(and(...conditions))
      .orderBy(desc(birthdayMessagesTable.createdAt))
      .limit(limit);

    const clientIds = [...new Set(messages.map((m) => m.clientId))];
    const clients = clientIds.length > 0
      ? await db.select().from(clientsTable).where(
          and(
            eq(clientsTable.tenantId, me.tenantId),
            sql`id = ANY(${clientIds}::text[])`
          )
        )
      : [];

    const clientMap: Record<string, typeof clients[0]> = {};
    for (const c of clients) { clientMap[c.id] = c; }

    const result = messages.map((m) => ({
      ...m,
      client: clientMap[m.clientId] ?? null,
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing birthday history");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/birthday/stats", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const year = new Date().getFullYear();
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const allMessages = await db
      .select()
      .from(birthdayMessagesTable)
      .where(
        and(
          eq(birthdayMessagesTable.tenantId, me.tenantId),
          eq(birthdayMessagesTable.birthdayYear, year)
        )
      );

    const thisMonth = allMessages.filter(
      (m) => m.createdAt >= startOfMonth
    );

    const whatsappSent = allMessages.filter((m) => m.sentWhatsapp).length;
    const emailSent = allMessages.filter((m) => m.sentEmail).length;
    const converted = allMessages.filter((m) => m.converted).length;
    const totalSent = allMessages.length;

    const allClients = await db
      .select({ id: clientsTable.id, birthDate: clientsTable.birthDate })
      .from(clientsTable)
      .where(and(eq(clientsTable.tenantId, me.tenantId), sql`birth_date IS NOT NULL`));

    const month = today.getMonth() + 1;
    const day = today.getDate();
    const todayCount = allClients.filter((c) => {
      const bd = c.birthDate!;
      return (bd.getMonth() + 1) === month && bd.getDate() === day;
    }).length;

    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingWeek = allClients.filter((c) => {
      const bd = c.birthDate!;
      const thisYearBd = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
      return thisYearBd > today && thisYearBd <= nextWeek;
    }).length;

    res.json({
      totalSentYear: totalSent,
      sentThisMonth: thisMonth.length,
      whatsappSent,
      emailSent,
      converted,
      conversionRate: totalSent > 0 ? Math.round((converted / totalSent) * 100) : 0,
      todayCount,
      upcomingWeek,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting birthday stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/birthday/:clientId/send", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const result = await processBirthdayForClient(me.tenantId, req.params.clientId, {
      isManual: true,
      sentById: me.id,
    });

    if (!result.success && result.error === "Client not found") {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    res.json({ success: result.success, couponCode: result.couponCode, error: result.error });
  } catch (err) {
    req.log.error({ err }, "Error sending birthday message");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/birthday/settings", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const settings = await getBirthdaySettings(me.tenantId);
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Error getting birthday settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

const BirthdaySettingsBody = z.object({
  enabled: z.boolean().optional(),
  discountPercent: z.number().int().min(1).max(100).optional(),
  validDays: z.number().int().min(1).max(365).optional(),
  sendWhatsapp: z.boolean().optional(),
  sendEmail: z.boolean().optional(),
  whatsappMessage: z.string().optional(),
});

router.put("/birthday/settings", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = BirthdaySettingsBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const current = await getBirthdaySettings(me.tenantId);
    const updated = { ...current, ...parsed.data };

    const existing = await db
      .select()
      .from(systemConfigsTable)
      .where(and(eq(systemConfigsTable.tenantId, me.tenantId), eq(systemConfigsTable.key, "birthday_settings")))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(systemConfigsTable)
        .set({ value: updated })
        .where(and(eq(systemConfigsTable.tenantId, me.tenantId), eq(systemConfigsTable.key, "birthday_settings")));
    } else {
      await db.insert(systemConfigsTable).values({
        id: generateId(),
        tenantId: me.tenantId,
        key: "birthday_settings",
        value: updated,
      });
    }

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating birthday settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
