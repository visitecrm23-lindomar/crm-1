import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, tenantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id";
import {
  SyncMeBody,
  CreateUserBody,
  UpdateUserBody,
  GetMeResponse,
  SyncMeResponse,
} from "@workspace/api-zod";

const router = Router();

router.get("/users/me", async (req, res): Promise<void> => {
  try {
    const auth = (req as any).auth;
    if (!auth?.userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(GetMeResponse.parse({
      id: user.id,
      clerkId: user.clerkId,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      tenantId: user.tenantId,
      referralCode: user.referralCode,
      referralBalance: Number(user.referralBalance),
      createdAt: user.createdAt.toISOString(),
    }));
  } catch (err) {
    req.log.error({ err }, "Error fetching user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/me/sync", async (req, res): Promise<void> => {
  try {
    const auth = (req as any).auth;
    if (!auth?.userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const parsed = SyncMeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { clerkId, name, email, avatarUrl } = parsed.data;

    const existing = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);

    let tenant = await db.select().from(tenantsTable).limit(1);
    let tenantId: string;
    if (!tenant[0]) {
      tenantId = generateId();
      await db.insert(tenantsTable).values({
        id: tenantId,
        name: name + "'s Agency",
        slug: tenantId,
        email: email,
        planId: "starter",
        status: "trial",
        limits: { users: 10, clients: 1000, trips: 50 },
      });
    } else {
      tenantId = tenant[0].id;
    }

    if (!existing[0]) {
      const userId = generateId();
      const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      await db.insert(usersTable).values({
        id: userId,
        clerkId,
        tenantId,
        name,
        email,
        avatarUrl: avatarUrl ?? null,
        role: "agencia",
        referralCode,
        referralBalance: "0",
      });
      const [newUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      res.json(SyncMeResponse.parse({
        id: newUser.id,
        clerkId: newUser.clerkId,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        avatarUrl: newUser.avatarUrl,
        isActive: newUser.isActive,
        tenantId: newUser.tenantId,
        referralCode: newUser.referralCode,
        referralBalance: Number(newUser.referralBalance),
        createdAt: newUser.createdAt.toISOString(),
      }));
    } else {
      await db.update(usersTable).set({
        name,
        email,
        avatarUrl: avatarUrl ?? null,
        lastLoginAt: new Date(),
      }).where(eq(usersTable.clerkId, clerkId));
      const [updatedUser] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
      res.json(SyncMeResponse.parse({
        id: updatedUser.id,
        clerkId: updatedUser.clerkId,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        avatarUrl: updatedUser.avatarUrl,
        isActive: updatedUser.isActive,
        tenantId: updatedUser.tenantId,
        referralCode: updatedUser.referralCode,
        referralBalance: Number(updatedUser.referralBalance),
        createdAt: updatedUser.createdAt.toISOString(),
      }));
    }
  } catch (err) {
    req.log.error({ err }, "Error syncing user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users", async (req, res): Promise<void> => {
  try {
    const auth = (req as any).auth;
    if (!auth?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const [me] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
    if (!me?.tenantId) { res.json([]); return; }
    const users = await db.select().from(usersTable).where(eq(usersTable.tenantId, me.tenantId));
    res.json(users.map(u => ({
      id: u.id, clerkId: u.clerkId, name: u.name, email: u.email, role: u.role,
      avatarUrl: u.avatarUrl, isActive: u.isActive, tenantId: u.tenantId,
      referralCode: u.referralCode, referralBalance: Number(u.referralBalance),
      createdAt: u.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing users");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users", async (req, res): Promise<void> => {
  try {
    const auth = (req as any).auth;
    if (!auth?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [me] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
    const tenantId = me?.tenantId ?? "default-tenant";
    const userId = generateId();
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.insert(usersTable).values({
      id: userId,
      clerkId: "pending-" + userId,
      tenantId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      referralCode,
      referralBalance: "0",
    });
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    res.status(201).json({
      id: user.id, clerkId: user.clerkId, name: user.name, email: user.email, role: user.role,
      avatarUrl: user.avatarUrl, isActive: user.isActive, tenantId: user.tenantId,
      referralCode: user.referralCode, referralBalance: Number(user.referralBalance),
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error creating user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  try {
    const auth = (req as any).auth;
    if (!auth?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = UpdateUserBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.role) updates.role = parsed.data.role;
    if (parsed.data.isActive !== null && parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
    await db.update(usersTable).set(updates).where(eq(usersTable.id, req.params.id));
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.params.id)).limit(1);
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      id: user.id, clerkId: user.clerkId, name: user.name, email: user.email, role: user.role,
      avatarUrl: user.avatarUrl, isActive: user.isActive, tenantId: user.tenantId,
      referralCode: user.referralCode, referralBalance: Number(user.referralBalance),
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
