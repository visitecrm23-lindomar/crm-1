import { Router } from "express";
import { db, chatbotConversationsTable, chatbotMessagesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";

const router = Router();
const ADMIN_ROLES = ["agencia", "superadmin"];

const CreateConversationBody = z.object({
  clientId: z.string().optional(),
  channel: z.enum(["webchat", "whatsapp", "email"]).optional(),
  sessionId: z.string().optional(),
});

const CreateMessageBody = z.object({
  conversationId: z.string(),
  role: z.enum(["user", "assistant", "system"]).optional(),
  content: z.string().min(1),
  mediaUrl: z.string().optional(),
  isBot: z.boolean().optional(),
});

router.get("/chatbot-conversations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const conversations = await db.select().from(chatbotConversationsTable)
      .where(eq(chatbotConversationsTable.tenantId, me.tenantId))
      .orderBy(desc(chatbotConversationsTable.createdAt));
    res.json(conversations);
  } catch (err) {
    req.log.error({ err }, "Error listing chatbot conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/chatbot-conversations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateConversationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(chatbotConversationsTable).values({ id, tenantId: me.tenantId, ...parsed.data });
    const [conv] = await db.select().from(chatbotConversationsTable).where(eq(chatbotConversationsTable.id, id)).limit(1);
    res.status(201).json(conv);
  } catch (err) {
    req.log.error({ err }, "Error creating chatbot conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/chatbot-conversations/:id/messages", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [conv] = await db.select().from(chatbotConversationsTable)
      .where(and(eq(chatbotConversationsTable.id, req.params.id), eq(chatbotConversationsTable.tenantId, me.tenantId))).limit(1);
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const messages = await db.select().from(chatbotMessagesTable)
      .where(eq(chatbotMessagesTable.conversationId, req.params.id))
      .orderBy(chatbotMessagesTable.sentAt);
    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Error listing chatbot messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/chatbot-messages", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateMessageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(chatbotMessagesTable).values({ id, tenantId: me.tenantId, ...parsed.data });
    const [msg] = await db.select().from(chatbotMessagesTable).where(eq(chatbotMessagesTable.id, id)).limit(1);
    res.status(201).json(msg);
  } catch (err) {
    req.log.error({ err }, "Error creating chatbot message");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/chatbot-conversations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = z.object({
      status: z.string().optional(),
      assignedUserId: z.string().optional(),
      endedAt: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Record<string, unknown> = {};
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.assignedUserId) updates.assignedUserId = parsed.data.assignedUserId;
    if (parsed.data.endedAt) updates.endedAt = new Date(parsed.data.endedAt);
    await db.update(chatbotConversationsTable).set(updates)
      .where(and(eq(chatbotConversationsTable.id, req.params.id), eq(chatbotConversationsTable.tenantId, me.tenantId)));
    const [conv] = await db.select().from(chatbotConversationsTable)
      .where(and(eq(chatbotConversationsTable.id, req.params.id), eq(chatbotConversationsTable.tenantId, me.tenantId))).limit(1);
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    res.json(conv);
  } catch (err) {
    req.log.error({ err }, "Error updating chatbot conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
