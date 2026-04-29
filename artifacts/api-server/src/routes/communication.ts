import { Router } from "express";
import { db } from "@workspace/db";
import { messagesTable, messageTemplatesTable, automationsTable, clientsTable, emailLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { z } from "zod";
import { ADMIN_ROLES, MANAGEMENT_ROLES } from '../lib/tenant';
import { resendEmailLog } from "../queues/email-helpers";

const router = Router();

const CreateMessageBody = z.object({
  toClientId: z.string().optional(),
  channel: z.string(),
  content: z.string(),
});

const CreateMessageTemplateBody = z.object({
  name: z.string(),
  channel: z.string(),
  category: z.string().optional(),
  subject: z.string().optional(),
  content: z.string(),
  variables: z.array(z.string()).optional(),
});

const UpdateMessageTemplateBody = z.object({
  name: z.string().optional(),
  content: z.string().optional(),
  subject: z.string().optional(),
  variables: z.array(z.string()).optional(),
});

const CreateAutomationBody = z.object({
  name: z.string(),
  description: z.string().optional(),
  triggerType: z.string(),
  triggerConfig: z.record(z.unknown()).optional(),
  conditions: z.unknown().optional(),
  isActive: z.boolean().optional(),
});

const UpdateAutomationBody = z.object({
  name: z.string().optional(),
  isActive: z.boolean().optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  conditions: z.unknown().optional(),
});

function formatMessage(m: typeof messagesTable.$inferSelect) {
  return {
    id: m.id, tenantId: m.tenantId, fromUserId: m.fromUserId, toClientId: m.toClientId,
    channel: m.channel, content: m.content, status: m.status,
    sentAt: m.sentAt.toISOString(),
    deliveredAt: m.deliveredAt?.toISOString() ?? null, readAt: m.readAt?.toISOString() ?? null,
    metadata: m.metadata,
  };
}

function formatTemplate(t: typeof messageTemplatesTable.$inferSelect) {
  return {
    id: t.id, tenantId: t.tenantId, name: t.name, channel: t.channel,
    category: t.category, subject: t.subject, content: t.content,
    variables: t.variables ?? [],
    createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
  };
}

function formatAutomation(a: typeof automationsTable.$inferSelect) {
  return {
    id: a.id, tenantId: a.tenantId, name: a.name, description: a.description,
    triggerType: a.triggerType, triggerConfig: a.triggerConfig ?? {},
    conditions: a.conditions ?? {}, isActive: a.isActive,
    executionsCount: a.executionsCount,
    lastExecutedAt: a.lastExecutedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
  };
}

router.get("/messages", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const { clientId } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof eq>[] = [eq(messagesTable.tenantId, me.tenantId)];
    if (clientId) conditions.push(eq(messagesTable.toClientId, clientId));
    const messages = await db.select().from(messagesTable)
      .where(and(...conditions)).orderBy(desc(messagesTable.sentAt));
    res.json(messages.map(formatMessage));
  } catch (err) {
    req.log.error({ err }, "Error listing messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/messages", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateMessageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    if (parsed.data.toClientId) {
      const [client] = await db.select().from(clientsTable)
        .where(and(eq(clientsTable.id, parsed.data.toClientId), eq(clientsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!client) { res.status(400).json({ error: "Client not found or not in tenant" }); return; }
    }

    const id = generateId();
    await db.insert(messagesTable).values({
      id,
      tenantId: me.tenantId,
      fromUserId: me.id,
      toClientId: parsed.data.toClientId ?? null,
      channel: parsed.data.channel,
      content: parsed.data.content,
      status: "sent",
    });
    const [message] = await db.select().from(messagesTable)
      .where(and(eq(messagesTable.id, id), eq(messagesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!message) { res.status(500).json({ error: "Failed to send message" }); return; }
    res.status(201).json(formatMessage(message));
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/message-templates", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const templates = await db.select().from(messageTemplatesTable)
      .where(eq(messageTemplatesTable.tenantId, me.tenantId))
      .orderBy(desc(messageTemplatesTable.createdAt));
    res.json(templates.map(formatTemplate));
  } catch (err) {
    req.log.error({ err }, "Error listing templates");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/message-templates", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateMessageTemplateBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(messageTemplatesTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      channel: parsed.data.channel,
      category: parsed.data.category ?? null,
      subject: parsed.data.subject ?? null,
      content: parsed.data.content,
      variables: parsed.data.variables ?? [],
    });
    const [template] = await db.select().from(messageTemplatesTable)
      .where(and(eq(messageTemplatesTable.id, id), eq(messageTemplatesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!template) { res.status(500).json({ error: "Failed to create template" }); return; }
    res.status(201).json(formatTemplate(template));
  } catch (err) {
    req.log.error({ err }, "Error creating template");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/message-templates/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateMessageTemplateBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof messageTemplatesTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.content != null) updates.content = parsed.data.content;
    if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject ?? null;
    if (parsed.data.variables != null) updates.variables = parsed.data.variables;
    await db.update(messageTemplatesTable).set(updates)
      .where(and(eq(messageTemplatesTable.id, req.params.id), eq(messageTemplatesTable.tenantId, me.tenantId)));
    const [template] = await db.select().from(messageTemplatesTable)
      .where(and(eq(messageTemplatesTable.id, req.params.id), eq(messageTemplatesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!template) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatTemplate(template));
  } catch (err) {
    req.log.error({ err }, "Error updating template");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/message-templates/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(messageTemplatesTable)
      .where(and(eq(messageTemplatesTable.id, req.params.id), eq(messageTemplatesTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting template");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/automations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const automations = await db.select().from(automationsTable)
      .where(eq(automationsTable.tenantId, me.tenantId))
      .orderBy(desc(automationsTable.createdAt));
    res.json(automations.map(formatAutomation));
  } catch (err) {
    req.log.error({ err }, "Error listing automations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/automations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateAutomationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(automationsTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      triggerType: parsed.data.triggerType,
      triggerConfig: parsed.data.triggerConfig ?? {},
      conditions: parsed.data.conditions ?? null,
      isActive: parsed.data.isActive ?? true,
    });
    const [automation] = await db.select().from(automationsTable)
      .where(and(eq(automationsTable.id, id), eq(automationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!automation) { res.status(500).json({ error: "Failed to create automation" }); return; }
    res.status(201).json(formatAutomation(automation));
  } catch (err) {
    req.log.error({ err }, "Error creating automation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/automations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateAutomationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof automationsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    if (parsed.data.triggerConfig != null) updates.triggerConfig = parsed.data.triggerConfig;
    if (parsed.data.conditions !== undefined) updates.conditions = parsed.data.conditions ?? null;
    await db.update(automationsTable).set(updates)
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)));
    const [automation] = await db.select().from(automationsTable)
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!automation) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatAutomation(automation));
  } catch (err) {
    req.log.error({ err }, "Error updating automation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/automations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(automationsTable)
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting automation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/automations/:id/toggle", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [existing] = await db.select().from(automationsTable)
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(automationsTable).set({ isActive: !existing.isActive })
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)));
    const [automation] = await db.select().from(automationsTable)
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!automation) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatAutomation(automation));
  } catch (err) {
    req.log.error({ err }, "Error toggling automation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clients-for-messaging", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const clients = await db.select().from(clientsTable)
      .where(eq(clientsTable.tenantId, me.tenantId));
    res.json(clients.map(c => ({ id: c.id, name: c.name, email: c.email, whatsapp: c.whatsapp })));
  } catch (err) {
    req.log.error({ err }, "Error listing clients for messaging");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Email Logs ──────────────────────────────────────────────────────────────

router.get("/email-logs", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const logs = await db
      .select()
      .from(emailLogsTable)
      .where(eq(emailLogsTable.tenantId, me.tenantId))
      .orderBy(desc(emailLogsTable.createdAt))
      .limit(200);
    res.json(logs);
  } catch (err) {
    req.log.error({ err }, "Error listing email logs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/email-logs/:id/resend", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const result = await resendEmailLog(req.params.id, me.tenantId);
    if (!result.ok) {
      const status = result.error === "Only failed emails can be resent" ? 422 : 404;
      res.status(status).json({ error: result.error ?? "Not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error resending email");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
