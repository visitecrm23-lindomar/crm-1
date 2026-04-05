import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";

export type AuthedUser = {
  id: string;
  clerkId: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
};

export async function requireAuth(req: Request, res: Response): Promise<AuthedUser | null> {
  const auth = (req as any).auth;
  if (!auth?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
  if (!user?.tenantId) {
    res.status(401).json({ error: "User not provisioned" });
    return null;
  }
  return user as AuthedUser;
}

export async function getTenantUser(req: Request): Promise<AuthedUser | null> {
  const auth = (req as any).auth;
  if (!auth?.userId) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
  if (!user?.tenantId) return null;
  return user as AuthedUser;
}
