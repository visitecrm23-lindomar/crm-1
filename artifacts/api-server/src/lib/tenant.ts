import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";

export async function getTenantId(req: Request): Promise<string> {
  const auth = (req as any).auth;
  if (!auth?.userId) {
    throw new Error("Not authenticated");
  }
  const user = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
  if (!user[0]?.tenantId) {
    return "default-tenant";
  }
  return user[0].tenantId;
}

export async function getUserId(req: Request): Promise<string> {
  const auth = (req as any).auth;
  if (!auth?.userId) {
    throw new Error("Not authenticated");
  }
  const user = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
  if (!user[0]) {
    throw new Error("User not found in DB");
  }
  return user[0].id;
}
