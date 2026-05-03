import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { ROLES, ADMIN_ROLES, MANAGEMENT_ROLES, ALL_STAFF_ROLES } from "@workspace/permissions";

export type { Role } from "@workspace/permissions";
export { ROLES, ADMIN_ROLES, MANAGEMENT_ROLES, ALL_STAFF_ROLES };

import type { Role } from "@workspace/permissions";
export const AGENCY_STAFF_ROLES = [ROLES.AGENCY_ADMIN, ROLES.AGENCY_MANAGER, ROLES.SALES, ROLES.SUPPORT] as const satisfies readonly Role[];

export type AuthedUser = {
  id: string;
  clerkId: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
};

export async function requireAuth(req: Request, res: Response): Promise<AuthedUser | null> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated", code: "UNAUTHORIZED", message: "Not authenticated", requestId: req.id ?? "unknown" });
    return null;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User not provisioned", code: "USER_NOT_PROVISIONED", message: "User not provisioned", requestId: req.id ?? "unknown" });
    return null;
  }
  // Superadmins may not have a tenantId (they manage the platform globally)
  if (!user.tenantId && user.role !== ROLES.SUPER_ADMIN) {
    res.status(401).json({ error: "User not provisioned", code: "USER_NOT_PROVISIONED", message: "User not provisioned", requestId: req.id ?? "unknown" });
    return null;
  }
  // Return superadmin with empty string tenantId so routes using me.tenantId gracefully return empty results
  const authed = { ...user, tenantId: user.tenantId ?? "" } as AuthedUser;
  req.tenantId = authed.tenantId;
  req.userId = authed.id;
  return authed;
}

export async function getTenantUser(req: Request): Promise<AuthedUser | null> {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
  if (!user) return null;
  if (!user.tenantId && user.role !== ROLES.SUPER_ADMIN) return null;
  return { ...user, tenantId: user.tenantId ?? "" } as AuthedUser;
}

export function requireRole(allowedRoles: string[]) {
  return async (req: Request, res: Response, next: () => void): Promise<void> => {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!allowedRoles.includes(me.role)) {
      res.status(403).json({ error: "Forbidden: insufficient role", code: "FORBIDDEN_ROLE", message: "Forbidden: insufficient role", requestId: (req as import("express").Request & { id?: string }).id ?? "unknown" });
      return;
    }
    next();
  };
}
