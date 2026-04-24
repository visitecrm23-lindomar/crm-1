import { db, tenantsTable, plansTable, usersTable, clientsTable, tripsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import type { Request, Response } from "express";

type ResourceType = "users" | "clients" | "trips";

export async function checkPlanLimit(
  tenantId: string,
  resource: ResourceType,
  req: Request,
  res: Response
): Promise<boolean> {
  try {
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Tenant não encontrado" }); return false; }

    const planId = tenant.planId;
    const [plan] = await db
      .select()
      .from(plansTable)
      .where(eq(plansTable.slug, planId))
      .limit(1);

    let maxAllowed: number;
    let current: number;

    if (resource === "users") {
      maxAllowed = tenant.maxUsersOverride ?? plan?.maxUsers ?? 3;
      const [row] = await db.select({ cnt: count() }).from(usersTable).where(eq(usersTable.tenantId, tenantId));
      current = row?.cnt ?? 0;
    } else if (resource === "clients") {
      maxAllowed = tenant.maxClientsOverride ?? plan?.maxClients ?? 500;
      const [row] = await db.select({ cnt: count() }).from(clientsTable).where(eq(clientsTable.tenantId, tenantId));
      current = row?.cnt ?? 0;
    } else {
      maxAllowed = tenant.maxTripsOverride ?? plan?.maxTrips ?? 20;
      const [row] = await db.select({ cnt: count() }).from(tripsTable).where(eq(tripsTable.tenantId, tenantId));
      current = row?.cnt ?? 0;
    }

    if (current >= maxAllowed) {
      const labels: Record<ResourceType, string> = {
        users: "usuários",
        clients: "clientes",
        trips: "viagens",
      };
      res.status(403).json({
        error: "limit_exceeded",
        message: `Limite do plano atingido: máximo de ${maxAllowed} ${labels[resource]}. Faça upgrade para continuar.`,
        resource,
        current,
        limit: maxAllowed,
        planId,
      });
      return false;
    }

    return true;
  } catch (err) {
    req.log?.error({ err }, "Error checking plan limit");
    res.status(500).json({ error: "Erro ao verificar limite do plano. Tente novamente." });
    return false;
  }
}
