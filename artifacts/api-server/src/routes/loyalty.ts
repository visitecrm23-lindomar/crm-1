import { Router } from "express";
import { db, loyaltyProgramsTable, loyaltyMembersTable, loyaltyTransactionsTable, clientsTable, paymentsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { loyaltyAwardPoints, calculateTier } from "../lib/loyalty-helpers";
import { ADMIN_ROLES } from '../lib/tenant';

const router = Router();

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

router.get("/clients/:clientId/loyalty", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const { clientId } = req.params;

    if (me.role === "cliente") {
      const [ownClient] = await db.select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.userId, me.id)))
        .limit(1);
      if (!ownClient || ownClient.id !== clientId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } else if (me.role === "vendedor") {
      const [targetClient] = await db.select({ createdById: clientsTable.createdById })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.id, clientId)))
        .limit(1);
      if (!targetClient || targetClient.createdById !== me.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const [member] = await db.select().from(loyaltyMembersTable)
      .where(and(
        eq(loyaltyMembersTable.tenantId, me.tenantId),
        eq(loyaltyMembersTable.clientId, clientId),
      )).limit(1);

    if (!member) {
      res.status(404).json({ error: "Client is not a loyalty member" });
      return;
    }

    const [program] = await db.select().from(loyaltyProgramsTable)
      .where(eq(loyaltyProgramsTable.id, member.programId)).limit(1);

    if (!program) {
      res.status(404).json({ error: "Loyalty program not found" });
      return;
    }

    const availablePoints = member.availablePoints ?? 0;
    const realPerPoint = Number(program.realPerPoint ?? "0");
    const minRedeemPoints = program.minRedeemPoints ?? 1;
    const maxRedeemableAmount = Math.round(availablePoints * realPerPoint * 100) / 100;

    res.json({
      memberId: member.id,
      programId: program.id,
      programName: program.name,
      availablePoints,
      realPerPoint,
      minRedeemPoints,
      maxRedeemableAmount,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching client loyalty info");
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

router.post("/loyalty/sync", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const members = await db
      .select()
      .from(loyaltyMembersTable)
      .where(eq(loyaltyMembersTable.tenantId, me.tenantId));

    if (members.length === 0) {
      res.json({ membersUpdated: 0, transactionsCreated: 0 });
      return;
    }

    const clientIds = members.map((m) => m.clientId);

    const paidPayments = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.tenantId, me.tenantId),
          eq(paymentsTable.status, "paid"),
          eq(paymentsTable.type, "receivable"),
          inArray(paymentsTable.clientId, clientIds)
        )
      );

    let transactionsCreated = 0;
    const creditedMemberIds = new Set<string>();

    for (const payment of paidPayments) {
      if (!payment.clientId) continue;
      const result = await loyaltyAwardPoints({
        clientId: payment.clientId,
        paymentId: payment.id,
        amount: payment.amount,
        tenantId: me.tenantId,
      });
      if (result.credited) {
        transactionsCreated++;
        const member = members.find((m) => m.clientId === payment.clientId);
        if (member) creditedMemberIds.add(member.id);
      }
    }

    const updatedMemberIds = new Set<string>(creditedMemberIds);

    const freshMembers = await db
      .select()
      .from(loyaltyMembersTable)
      .where(eq(loyaltyMembersTable.tenantId, me.tenantId));

    for (const member of freshMembers) {
      const correctTier = calculateTier(member.totalPoints);
      if (member.tier !== correctTier) {
        await db
          .update(loyaltyMembersTable)
          .set({ tier: correctTier })
          .where(eq(loyaltyMembersTable.id, member.id));
        updatedMemberIds.add(member.id);
      }
    }

    res.json({ membersUpdated: updatedMemberIds.size, transactionsCreated });
  } catch (err) {
    req.log.error({ err }, "Error syncing loyalty points");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
