import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, calendarEventsTable, tripsTable, paymentsTable, clientsTable } from "@workspace/db";
import { eq, and, count, max } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";
import { generateAuthUrl, verifyState, exchangeCodeForTokens, revokeToken } from "../lib/google-calendar/calendar-service";
import { CalendarSyncService } from "../lib/google-calendar/sync-service";
import { ALL_STAFF_ROLES } from '../lib/tenant';

const syncBodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("trip"), id: z.string().min(1) }),
  z.object({ type: z.literal("payment"), id: z.string().min(1) }),
  z.object({ type: z.literal("birthday"), id: z.string().min(1) }),
]);

const router = Router();

const FRONTEND_URL = process.env["FRONTEND_URL"] ?? `https://${process.env["REPLIT_DEV_DOMAIN"] ?? "localhost"}`;

router.get("/calendar/connect", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ALL_STAFF_ROLES.includes(me.role)) {
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

  // Verify HMAC-signed state to prevent CSRF/account-linking attacks
  const userId = verifyState(state);
  if (!userId) {
    res.redirect(`${FRONTEND_URL}/configuracoes?gcal=error&tab=integrations`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    const [user] = await db.select({ id: usersTable.id, tenantId: usersTable.tenantId })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!user) {
      res.redirect(`${FRONTEND_URL}/configuracoes?gcal=error&tab=integrations`);
      return;
    }

    const updateFields: Record<string, unknown> = {
      googleAccessToken: tokens.access_token ?? null,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      googleCalendarEnabled: true,
    };
    // Only overwrite refresh_token when Google returns a new one — on reconnect flows
    // Google omits refresh_token and we must keep the previously stored value.
    if (tokens.refresh_token) {
      updateFields.googleRefreshToken = tokens.refresh_token;
    }
    await db.update(usersTable).set(updateFields).where(eq(usersTable.id, userId));

    // Respond first, then fire-and-forget initial sync for this user only
    res.redirect(`${FRONTEND_URL}/configuracoes?gcal=success&tab=integrations`);
    CalendarSyncService.syncAllForUser(userId).catch((err) => {
      req.log.warn({ err, userId, context: "calendar/callback" }, "Initial syncAllForUser failed — continuing");
    });
  } catch (err) {
    req.log.error({ err }, "calendar/callback failed");
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
    if (!ALL_STAFF_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const parsed = syncBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Tipo de sincronização inválido", details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;

    if (body.type === "trip") {
      const [trip] = await db.select({ id: tripsTable.id })
        .from(tripsTable)
        .where(and(eq(tripsTable.id, body.id), eq(tripsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!trip) { res.status(404).json({ error: "Viagem não encontrada" }); return; }
      await CalendarSyncService.syncTripForUser(body.id, me.id);
      res.json({ success: true, message: "1 evento sincronizado com sucesso", synced: 1 });
    } else if (body.type === "payment") {
      const [payment] = await db.select({ id: paymentsTable.id })
        .from(paymentsTable)
        .where(and(eq(paymentsTable.id, body.id), eq(paymentsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!payment) { res.status(404).json({ error: "Pagamento não encontrado" }); return; }
      await CalendarSyncService.syncPaymentForUser(body.id, me.id);
      res.json({ success: true, message: "1 evento sincronizado com sucesso", synced: 1 });
    } else if (body.type === "birthday") {
      const [client] = await db.select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.id, body.id), eq(clientsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
      await CalendarSyncService.syncBirthdayForUser(body.id, me.id);
      res.json({ success: true, message: "1 evento sincronizado com sucesso", synced: 1 });
    } else {
      const synced = await CalendarSyncService.syncAllForUser(me.id);
      res.json({ success: true, message: `${synced} evento(s) sincronizado(s) com sucesso`, synced });
    }
  } catch (err) {
    req.log.error({ err }, "Error syncing Google Calendar");
    res.status(500).json({ error: "Erro ao sincronizar eventos" });
  }
});

export default router;
