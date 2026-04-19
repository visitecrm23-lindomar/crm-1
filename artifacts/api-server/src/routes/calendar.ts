import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, calendarEventsTable } from "@workspace/db";
import { eq, and, count, max } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";
import { generateAuthUrl, exchangeCodeForTokens, revokeToken } from "../lib/google-calendar/calendar-service";
import { CalendarSyncService } from "../lib/google-calendar/sync-service";

const router = Router();

const FRONTEND_URL = process.env["FRONTEND_URL"] ?? `https://${process.env["REPLIT_DEV_DOMAIN"] ?? "localhost"}`;

router.get("/calendar/connect", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin", "vendedor"].includes(me.role)) {
      res.status(403).json({ error: "Apenas agências e vendedores podem conectar o Google Calendar" });
      return;
    }
    const url = generateAuthUrl(me.id);
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, "Error generating Google Calendar auth URL");
    res.status(500).json({ error: "Erro ao gerar URL de autorização" });
  }
});

router.get("/calendar/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.redirect(`${FRONTEND_URL}/configuracoes?gcal=denied&tab=integrations`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${FRONTEND_URL}/configuracoes?gcal=error&tab=integrations`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    const [user] = await db.select({ id: usersTable.id, tenantId: usersTable.tenantId })
      .from(usersTable).where(eq(usersTable.id, state)).limit(1);

    if (!user) {
      res.redirect(`${FRONTEND_URL}/configuracoes?gcal=error&tab=integrations`);
      return;
    }

    await db.update(usersTable).set({
      googleAccessToken: tokens.access_token ?? null,
      googleRefreshToken: tokens.refresh_token ?? null,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      googleCalendarEnabled: true,
    }).where(eq(usersTable.id, state));

    res.redirect(`${FRONTEND_URL}/configuracoes?gcal=connected&tab=integrations`);
  } catch (err) {
    console.error("[calendar/callback] Error:", err);
    res.redirect(`${FRONTEND_URL}/configuracoes?gcal=error&tab=integrations`);
  }
});

router.post("/calendar/disconnect", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const [user] = await db.select({ googleAccessToken: usersTable.googleAccessToken })
      .from(usersTable).where(eq(usersTable.id, me.id)).limit(1);

    if (user?.googleAccessToken) {
      await revokeToken(user.googleAccessToken);
    }

    await db.update(usersTable).set({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      googleCalendarEnabled: false,
    }).where(eq(usersTable.id, me.id));

    await db.delete(calendarEventsTable).where(eq(calendarEventsTable.userId, me.id));

    res.json({ success: true, message: "Google Calendar desconectado com sucesso" });
  } catch (err) {
    req.log.error({ err }, "Error disconnecting Google Calendar");
    res.status(500).json({ error: "Erro ao desconectar Google Calendar" });
  }
});

router.get("/calendar/status", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const [user] = await db.select({
      googleCalendarEnabled: usersTable.googleCalendarEnabled,
      googleTokenExpiry: usersTable.googleTokenExpiry,
      googleAccessToken: usersTable.googleAccessToken,
    }).from(usersTable).where(eq(usersTable.id, me.id)).limit(1);

    if (!user?.googleCalendarEnabled) {
      res.json({ connected: false, eventsCount: 0, lastSync: null });
      return;
    }

    const [eventsCountResult] = await db.select({ count: count() })
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.userId, me.id));

    const [lastSyncResult] = await db.select({ lastSync: max(calendarEventsTable.syncedAt) })
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.userId, me.id));

    res.json({
      connected: true,
      tokenValid: user.googleTokenExpiry ? user.googleTokenExpiry > new Date() : true,
      eventsCount: Number(eventsCountResult?.count ?? 0),
      lastSync: lastSyncResult?.lastSync?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching Google Calendar status");
    res.status(500).json({ error: "Erro ao verificar status do Google Calendar" });
  }
});

router.post("/calendar/sync", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin", "vendedor"].includes(me.role)) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const { type, id } = req.body as { type?: string; id?: string };

    let synced = 0;

    if (type === "trip" && id) {
      await CalendarSyncService.syncTrip(id);
      synced = 1;
    } else if (type === "payment" && id) {
      await CalendarSyncService.syncPayment(id);
      synced = 1;
    } else if (type === "birthday" && id) {
      await CalendarSyncService.syncBirthday(id);
      synced = 1;
    } else if (type === "all") {
      synced = await CalendarSyncService.syncAll(me.tenantId);
    } else {
      res.status(400).json({ error: "Tipo de sincronização inválido" });
      return;
    }

    res.json({ success: true, message: `${synced} evento(s) sincronizado(s) com sucesso`, synced });
  } catch (err) {
    req.log.error({ err }, "Error syncing Google Calendar");
    res.status(500).json({ error: "Erro ao sincronizar eventos" });
  }
});

export default router;
