import { Router } from "express";
import { db, loyaltyProgramsTable, loyaltyMembersTable, loyaltyTransactionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";

const router = Router();
const ADMIN_ROLES = ["agencia", "superadmin"];

const CreateProgramBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  pointsPerReal: z.string().optional(),
  realPerPoint: z.string().optional(),
  minRedeemPoints: z.number().int().optional(),
});

const CreateMemberBody = z.object({
  programId: z.string(),
  clientId: z.string(),
  tier: z.string().optional(),
});

const CreateTransactionBody = z.object({
  memberId: z.string(),
  programId: z.string(),
  type: z.enum(["earn", "redeem", "expire", "bonus"]),
  points: z.number().int(),
  description: z.string().default(""),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
});

router.get("/loyalty-programs", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const programs = await db.select().from(loyaltyProgramsTable)
      .where(eq(loyaltyProgramsTable.tenantId, me.tenantId))
      .orderBy(desc(loyaltyProgramsTable.createdAt));
    res.json(programs);
  } catch (err) {
    req.log.error({ err }, "Error listing loyalty programs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/loyalty-programs", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateProgramBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(loyaltyProgramsTable).values({ id, tenantId: me.tenantId, ...parsed.data });
    const [prog] = await db.select().from(loyaltyProgramsTable).where(eq(loyaltyProgramsTable.id, id)).limit(1);
    res.status(201).json(prog);
  } catch (err) {
    req.log.error({ err }, "Error creating loyalty program");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/loyalty-programs/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateProgramBody.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(loyaltyProgramsTable).set(parsed.data)
      .where(and(eq(loyaltyProgramsTable.id, req.params.id), eq(loyaltyProgramsTable.tenantId, me.tenantId)));
    const [prog] = await db.select().from(loyaltyProgramsTable)
      .where(and(eq(loyaltyProgramsTable.id, req.params.id), eq(loyaltyProgramsTable.tenantId, me.tenantId))).limit(1);
    if (!prog) { res.status(404).json({ error: "Not found" }); return; }
    res.json(prog);
  } catch (err) {
    req.log.error({ err }, "Error updating loyalty program");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/loyalty-members", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const members = await db.select().from(loyaltyMembersTable)
      .where(eq(loyaltyMembersTable.tenantId, me.tenantId))
      .orderBy(desc(loyaltyMembersTable.joinedAt));
    res.json(members);
  } catch (err) {
    req.log.error({ err }, "Error listing loyalty members");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/loyalty-members", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateMemberBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(loyaltyMembersTable).values({ id, tenantId: me.tenantId, ...parsed.data });
    const [member] = await db.select().from(loyaltyMembersTable).where(eq(loyaltyMembersTable.id, id)).limit(1);
    res.status(201).json(member);
  } catch (err) {
    req.log.error({ err }, "Error creating loyalty member");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/loyalty-transactions", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const transactions = await db.select().from(loyaltyTransactionsTable)
      .where(eq(loyaltyTransactionsTable.tenantId, me.tenantId))
      .orderBy(desc(loyaltyTransactionsTable.createdAt));
    res.json(transactions);
  } catch (err) {
    req.log.error({ err }, "Error listing loyalty transactions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/loyalty-transactions", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateTransactionBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(loyaltyTransactionsTable).values({ id, tenantId: me.tenantId, ...parsed.data });
    const [tx] = await db.select().from(loyaltyTransactionsTable).where(eq(loyaltyTransactionsTable.id, id)).limit(1);
    res.status(201).json(tx);
  } catch (err) {
    req.log.error({ err }, "Error creating loyalty transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
