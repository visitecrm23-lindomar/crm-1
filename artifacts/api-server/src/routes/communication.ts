import { Router } from "express";
import { db } from "@workspace/db";
import { messagesTable, messageTemplatesTable, automationsTable, clientsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import {
  SendMessageBody,
  CreateMessageTemplateBody,
  UpdateMessageTemplateBody,
  CreateAutomationBody,
  UpdateAutomationBody,
} from "@workspace/api-zod";

const router = Router();

async function getTenantInfo(req: any) {
  const auth = req.auth;
  if (!auth?.userId) return null;
  const [me] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
  return me;
}

// Messages
router.get("/messages", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }

    const { clientId, channel, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let conditions: any[] = [eq(messagesTable.tenantId, me.tenantId)];
    if (clientId) conditions.push(eq(messagesTable.toClientId, clientId));
    if (channel) conditions.push(eq(messagesTable.channel, channel));

    const messages = await db.select().from(messagesTable)
      .where(and(...conditions)).orderBy(desc(messagesTable.sentAt))
      .limit(limitNum).offset(offset);

    const clientsMap: Record<string, string> = {};
    const clients = await db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable)
      .where(eq(clientsTable.tenantId, me.tenantId));
    clients.forEach(c => { clientsMap[c.id] = c.name; });

    res.json(messages.map(m => ({
      id: m.id, toClientId: m.toClientId, channel: m.channel, content: m.content,
      mediaUrl: m.mediaUrl, status: m.status, sentAt: m.sentAt.toISOString(),
      deliveredAt: m.deliveredAt?.toISOString() ?? null, readAt: m.readAt?.toISOString() ?? null,
      clientName: m.toClientId ? clientsMap[m.toClientId] ?? null : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/messages", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = SendMessageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const id = generateId();
    await db.insert(messagesTable).values({
      id,
      tenantId: me.tenantId,
      fromUserId: me.id,
      toClientId: parsed.data.toClientId,
      channel: parsed.data.channel,
      content: parsed.data.content,
      mediaUrl: parsed.data.mediaUrl ?? null,
    });

    const [message] = await db.select().from(messagesTable).where(eq(messagesTable.id, id)).limit(1);
    res.status(201).json({
      id: message.id, toClientId: message.toClientId, channel: message.channel,
      content: message.content, mediaUrl: message.mediaUrl, status: message.status,
      sentAt: message.sentAt.toISOString(), deliveredAt: null, readAt: null, clientName: null,
    });
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Templates
router.get("/message-templates", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }

    const templates = await db.select().from(messageTemplatesTable)
      .where(eq(messageTemplatesTable.tenantId, me.tenantId))
      .orderBy(desc(messageTemplatesTable.createdAt));

    res.json(templates.map(t => ({
      id: t.id, name: t.name, channel: t.channel, subject: t.subject,
      content: t.content, variables: t.variables ?? [], category: t.category,
      createdAt: t.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing templates");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/message-templates", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateMessageTemplateBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const id = generateId();
    await db.insert(messageTemplatesTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      channel: parsed.data.channel,
      subject: parsed.data.subject ?? null,
      content: parsed.data.content,
      variables: parsed.data.variables ?? [],
      category: parsed.data.category ?? null,
    });

    const [template] = await db.select().from(messageTemplatesTable).where(eq(messageTemplatesTable.id, id)).limit(1);
    res.status(201).json({
      id: template.id, name: template.name, channel: template.channel, subject: template.subject,
      content: template.content, variables: template.variables ?? [], category: template.category,
      createdAt: template.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error creating template");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/message-templates/:id", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = UpdateMessageTemplateBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: any = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject;
    if (parsed.data.content != null) updates.content = parsed.data.content;
    if (parsed.data.category !== undefined) updates.category = parsed.data.category;
    await db.update(messageTemplatesTable).set(updates)
      .where(and(eq(messageTemplatesTable.id, req.params.id), eq(messageTemplatesTable.tenantId, me.tenantId)));
    const [template] = await db.select().from(messageTemplatesTable)
      .where(and(eq(messageTemplatesTable.id, req.params.id), eq(messageTemplatesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!template) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      id: template.id, name: template.name, channel: template.channel, subject: template.subject,
      content: template.content, variables: template.variables ?? [], category: template.category,
      createdAt: template.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating template");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/message-templates/:id", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    await db.delete(messageTemplatesTable)
      .where(and(eq(messageTemplatesTable.id, req.params.id), eq(messageTemplatesTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting template");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Automations
router.get("/automations", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }

    const automations = await db.select().from(automationsTable)
      .where(eq(automationsTable.tenantId, me.tenantId))
      .orderBy(desc(automationsTable.createdAt));

    res.json(automations.map(a => ({
      id: a.id, name: a.name, description: a.description, triggerType: a.triggerType,
      triggerConfig: a.triggerConfig, isActive: a.isActive, executionsCount: a.executionsCount,
      lastExecutedAt: a.lastExecutedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing automations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/automations", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateAutomationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const id = generateId();
    await db.insert(automationsTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      triggerType: parsed.data.triggerType,
      triggerConfig: parsed.data.triggerConfig,
      conditions: parsed.data.conditions ?? null,
    });

    const [automation] = await db.select().from(automationsTable).where(eq(automationsTable.id, id)).limit(1);
    res.status(201).json({
      id: automation.id, name: automation.name, description: automation.description,
      triggerType: automation.triggerType, triggerConfig: automation.triggerConfig,
      isActive: automation.isActive, executionsCount: automation.executionsCount,
      lastExecutedAt: null, createdAt: automation.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error creating automation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/automations/:id", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = UpdateAutomationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: any = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    if (parsed.data.triggerConfig != null) updates.triggerConfig = parsed.data.triggerConfig;
    await db.update(automationsTable).set(updates)
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)));
    const [automation] = await db.select().from(automationsTable)
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!automation) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      id: automation.id, name: automation.name, description: automation.description,
      triggerType: automation.triggerType, triggerConfig: automation.triggerConfig,
      isActive: automation.isActive, executionsCount: automation.executionsCount,
      lastExecutedAt: automation.lastExecutedAt?.toISOString() ?? null,
      createdAt: automation.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating automation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/automations/:id", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
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
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const [current] = await db.select().from(automationsTable)
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!current) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(automationsTable).set({ isActive: !current.isActive })
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)));
    const [automation] = await db.select().from(automationsTable)
      .where(and(eq(automationsTable.id, req.params.id), eq(automationsTable.tenantId, me.tenantId)))
      .limit(1);
    res.json({
      id: automation.id, name: automation.name, description: automation.description,
      triggerType: automation.triggerType, triggerConfig: automation.triggerConfig,
      isActive: automation.isActive, executionsCount: automation.executionsCount,
      lastExecutedAt: automation.lastExecutedAt?.toISOString() ?? null,
      createdAt: automation.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error toggling automation");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
