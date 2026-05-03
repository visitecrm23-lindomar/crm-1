import { db } from "@workspace/db";
import { usersTable, pipelineStagesTable, tripsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { AppError } from "../../lib/errors";

export interface ReservationContext {
  reservationCreatedById: string;
  vitrineStageId: string | null;
  tripNameMap: Map<string, string>;
}

export async function loadReservationContext(args: {
  tenantId: string;
  tripIds: string[];
}): Promise<ReservationContext> {
  const { tenantId, tripIds } = args;

  const [adminUser] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.isActive, true)))
    .limit(1);
  if (!adminUser) {
    throw new AppError(
      "Não foi possível criar a reserva: nenhum usuário ativo encontrado para esta agência",
      500,
      "RESERVATION_NO_AGENCY_USER",
    );
  }

  const stages = await db.select({
    id: pipelineStagesTable.id,
    isDefaultWeb: pipelineStagesTable.isDefaultWeb,
    name: pipelineStagesTable.name,
  })
    .from(pipelineStagesTable)
    .where(eq(pipelineStagesTable.tenantId, tenantId));
  const vitrine = stages.find((s) => s.isDefaultWeb) ?? stages.find((s) => s.name === "Vitrine");

  const tripNameMap = new Map<string, string>();
  if (tripIds.length > 0) {
    const tripRows = await db.select({ id: tripsTable.id, name: tripsTable.name })
      .from(tripsTable)
      .where(and(inArray(tripsTable.id, tripIds), eq(tripsTable.tenantId, tenantId)));
    for (const t of tripRows) tripNameMap.set(t.id, t.name);
  }

  return {
    reservationCreatedById: adminUser.id,
    vitrineStageId: vitrine?.id ?? null,
    tripNameMap,
  };
}
