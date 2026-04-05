import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, tenantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import {
  SyncMeBody,
  CreateUserBody,
  UpdateUserBody,
  GetMeResponse,
  SyncMeResponse,
} from "@workspace/api-zod";
import { getAuth } from "@clerk/express";

const router = Router();

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id, clerkId: u.clerkId, name: u.name, email: u.email, role: u.role,
    avatarUrl: u.avatarUrl, isActive: u.isActive, tenantId: u.tenantId,
    referralCode: u.referralCode, referralBalance: Number(u.referralBalance),
    createdAt: u.createdAt.toISOString(),
  };
}

router.get("/users/me", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    let tenant = null;
    if (user.tenantId) {
      const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
      if (t) {
        tenant = {
          id: t.id, name: t.name, slug: t.slug, logoUrl: t.logoUrl,
          primaryColor: t.primaryColor, secondaryColor: t.secondaryColor,
          status: t.status, planId: t.planId,
        };
      }
    }
    res.json({
      id: user.id, clerkId: user.clerkId, name: user.name, email: user.email,
      role: user.role, avatarUrl: user.avatarUrl, isActive: user.isActive,
      tenantId: user.tenantId, referralCode: user.referralCode,
      referralBalance: Number(user.referralBalance), createdAt: user.createdAt.toISOString(),
      tenant,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/me/sync", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const parsed = SyncMeBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { name, email, avatarUrl } = parsed.data;

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);

    let tenantId: string;
    if (existing) {
      if (!existing.tenantId) { res.status(500).json({ error: "User has no tenant assigned" }); return; }
      tenantId = existing.tenantId;
    } else {
      tenantId = generateId();
      const tenantSlug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + tenantId.slice(0, 4);
      await db.insert(tenantsTable).values({
        id: tenantId,
        name: name + "'s Agency",
        slug: tenantSlug,
        email,
        planId: "starter",
        status: "trial",
        limits: { users: 10, clients: 1000, trips: 50 },
      });
    }

    if (!existing) {
      const userId = generateId();
      const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      await db.insert(usersTable).values({
        id: userId, clerkId, tenantId, name, email,
        avatarUrl: avatarUrl ?? null, role: "agencia",
        referralCode, referralBalance: "0",
      });
      const [newUser] = await db.select().from(usersTable)
        .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
        .limit(1);
      if (!newUser) { res.status(500).json({ error: "Failed to create user" }); return; }
      res.json(SyncMeResponse.parse({
        id: newUser.id, clerkId: newUser.clerkId, name: newUser.name, email: newUser.email,
        role: newUser.role, avatarUrl: newUser.avatarUrl, isActive: newUser.isActive,
        tenantId: newUser.tenantId, referralCode: newUser.referralCode,
        referralBalance: Number(newUser.referralBalance), createdAt: newUser.createdAt.toISOString(),
      }));
    } else {
      await db.update(usersTable).set({ name, email, avatarUrl: avatarUrl ?? null, lastLoginAt: new Date() })
        .where(eq(usersTable.clerkId, clerkId));
      const [updatedUser] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
      if (!updatedUser) { res.status(500).json({ error: "User not found after update" }); return; }
      res.json(SyncMeResponse.parse({
        id: updatedUser.id, clerkId: updatedUser.clerkId, name: updatedUser.name, email: updatedUser.email,
        role: updatedUser.role, avatarUrl: updatedUser.avatarUrl, isActive: updatedUser.isActive,
        tenantId: updatedUser.tenantId, referralCode: updatedUser.referralCode,
        referralBalance: Number(updatedUser.referralBalance), createdAt: updatedUser.createdAt.toISOString(),
      }));
    }
  } catch (err) {
    req.log.error({ err }, "Error syncing user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const users = await db.select().from(usersTable).where(eq(usersTable.tenantId, me.tenantId));
    res.json(users.map(formatUser));
  } catch (err) {
    req.log.error({ err }, "Error listing users");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) {
      res.status(403).json({ error: "Apenas administradores podem criar usuarios" });
      return;
    }
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const userId = generateId();
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.insert(usersTable).values({
      id: userId,
      clerkId: "pending-" + userId,
      tenantId: me.tenantId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      referralCode,
      referralBalance: "0",
    });
    const [user] = await db.select().from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, me.tenantId)))
      .limit(1);
    if (!user) { res.status(500).json({ error: "Failed to create user" }); return; }
    res.status(201).json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "Error creating user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = UpdateUserBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.role != null || parsed.data.isActive != null) {
      const adminRoles = ["agencia", "superadmin"];
      if (!adminRoles.includes(me.role)) {
        res.status(403).json({ error: "Forbidden: apenas administradores podem alterar funcao ou status" });
        return;
      }
      if (parsed.data.role != null) updates.role = parsed.data.role;
      if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    }
    await db.update(usersTable).set(updates)
      .where(and(eq(usersTable.id, req.params.id), eq(usersTable.tenantId, me.tenantId)));
    const [user] = await db.select().from(usersTable)
      .where(and(eq(usersTable.id, req.params.id), eq(usersTable.tenantId, me.tenantId)))
      .limit(1);
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "Error updating user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
