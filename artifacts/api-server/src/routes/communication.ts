import { Router } from "express";
import { db } from "@workspace/db";
import { messagesTable, messageTemplatesTable, automationsTable, clientsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import {
  SendMessageBody as CreateMessageBody, CreateMessageTemplateBody, UpdateMessageTemplateBody,
  CreateAutomationBody, UpdateAutomationBody,
} from "@workspace/api-zod";

const router = Router();

function formatMessage(m: typeof messagesTable.$inferSelect) {
  return {
    id: m.id, tenantId: m.tenantId, fromUserId: m.fromUserId, toClientId: m.toClientId,
    channel: m.channel, direction: m.direction, content: m.content,
    status: m.status, sentAt: m.sentAt?.toISOString() ?? null,
    deliveredAt: m.deliveredAt?.toISOString() ?? null, readAt: m.readAt?.toISOString() ?? null,
    metadata: m.metadata, createdAt: m.createdAt.toISOString(),
  };
}

function formatTemplate(t: typeof messageTemplatesTable.$inferSelect) {
  return {
    id: t.id, tenantId: t.tenantId, name: t.name, channel: t.channel,
    category: t.category, subject: t.subject, body: t.body,
    variables: t.variables ?? [], isActive: t.isActive,
    createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
  };
}

function formatAutomation(a: typeof automationsTable.$inferSelect) {
  return {
    id: a.id, tenantId: a.tenantId, name: a.name, trigger: a.trigger,
    conditions: a.conditions ?? {}, actions: a.actions ?? [],
    isActive: a.isActive, executionCount: a.executionCount,
    lastExecutedAt: a.lastExecutedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
  };
}

router.get("/messages", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
    const { clientId } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof eq>[] = [eq(messagesTable.tenantId, me.tenantId)];
    if (clientId) conditions.push(eq(messagesTable.toClientId, clientId));
    const messages = await db.select().from(messagesTable)
      .where(and(...conditions)).orderBy(desc(messagesTable.createdAt));
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
      direction: "outbound",
      content: parsed.data.content,
      status: "sent",
      sentAt: new Date(),
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
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
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
      body: parsed.data.body,
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
    const parsed = UpdateMessageTemplateBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof messageTemplatesTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.body != null) updates.body = parsed.data.body;
    if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject ?? null;
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
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
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
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
    const parsed = CreateAutomationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(automationsTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      conditions: parsed.data.conditions ?? {},
      actions: parsed.data.actions ?? [],
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
    const parsed = UpdateAutomationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof automationsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    if (parsed.data.conditions != null) updates.conditions = parsed.data.conditions;
    if (parsed.data.actions != null) updates.actions = parsed.data.actions;
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
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
    const clients = await db.select().from(clientsTable)
      .where(eq(clientsTable.tenantId, me.tenantId));
    res.json(clients.map(c => ({ id: c.id, name: c.name, email: c.email, whatsapp: c.whatsapp })));
  } catch (err) {
    req.log.error({ err }, "Error listing clients for messaging");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
