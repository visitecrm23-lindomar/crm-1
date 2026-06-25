import { db } from "@workspace/db";
import { dealsTable, pipelineStagesTable, tripsTable } from "@workspace/db";
import { eq, and, desc, lte, gte, isNotNull, sql } from "drizzle-orm";
import { DEAL_STATUS } from "@workspace/permissions";
import { logger } from "../lib/logger";

export async function moveDealToStage({
  tenantId,
  dealId,
  clientId,
  reservationId,
  targetStageName,
  forwardOnly,
}: {
  tenantId: string;
  dealId?: string;
  clientId?: string | null;
  reservationId?: string | null;
  targetStageName: string;
  forwardOnly: boolean;
}): Promise<void> {
  try {
    // Step 1: Find the deal first so we know which pipeline it belongs to.
    let deal: { id: string; stageId: string } | undefined;

    if (dealId) {
      const [found] = await db
        .select({ id: dealsTable.id, stageId: dealsTable.stageId })
        .from(dealsTable)
        .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId)))
        .limit(1);
      deal = found;
    } else {
      const [found] = await db
        .select({ id: dealsTable.id, stageId: dealsTable.stageId })
        .from(dealsTable)
        .where(
          and(
            eq(dealsTable.tenantId, tenantId),
            eq(dealsTable.status, DEAL_STATUS.OPEN),
            reservationId
              ? eq(dealsTable.reservationId, reservationId)
              : clientId
                ? eq(dealsTable.clientId, clientId)
                : undefined,
          ),
        )
        .orderBy(desc(dealsTable.createdAt))
        .limit(1);
      deal = found;
    }

    if (!deal) return;

    // Step 2: Look up the deal's current stage to obtain its pipelineId and order.
    // Both are needed: pipelineId scopes the target-stage search to the same
    // pipeline; order is used for the forwardOnly guard.
    const [currentStageRow] = await db
      .select({ order: pipelineStagesTable.order, pipelineId: pipelineStagesTable.pipelineId })
      .from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.id, deal.stageId))
      .limit(1);

    if (!currentStageRow) return;

    // Step 3: Find the target stage by name, scoped to the deal's own pipeline.
    // If the name doesn't exist in this pipeline we log a warning and do nothing —
    // we never move a deal to a stage that belongs to a different pipeline.
    const [targetStage] = await db
      .select({ id: pipelineStagesTable.id, order: pipelineStagesTable.order })
      .from(pipelineStagesTable)
      .where(
        and(
          eq(pipelineStagesTable.pipelineId, currentStageRow.pipelineId),
          eq(pipelineStagesTable.tenantId, tenantId),
          eq(pipelineStagesTable.name, targetStageName),
        ),
      )
      .limit(1);

    if (!targetStage) {
      logger.warn(
        { tenantId, targetStageName, pipelineId: currentStageRow.pipelineId, dealId: deal.id },
        "[pipeline-automation] Target stage not found in deal's pipeline — skipping move",
      );
      return;
    }

    // Step 4: Forward-only guard — never move a deal backwards.
    if (forwardOnly && currentStageRow.order >= targetStage.order) return;

    // Step 5: Advance the deal.
    await db
      .update(dealsTable)
      .set({ stageId: targetStage.id })
      .where(and(eq(dealsTable.id, deal.id), eq(dealsTable.tenantId, tenantId)));
  } catch (err) {
    logger.error({ err, tenantId, targetStageName }, "[pipeline-automation] Failed to move deal to stage");
  }
}

export async function runPipelineTripEndedCron(): Promise<void> {
  logger.info("[pipeline-automation] Running trip-ended cron");
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const endedTrips = await db
    .select({ id: tripsTable.id, tenantId: tripsTable.tenantId })
    .from(tripsTable)
    .where(
      and(
        isNotNull(tripsTable.returnDate),
        lte(sql`${tripsTable.returnDate}`, sql`${now}`),
        gte(sql`${tripsTable.returnDate}`, sql`${sevenDaysAgo}`),
      ),
    );

  logger.info({ count: endedTrips.length }, "[pipeline-automation] Trips ended — processing deals");

  let moved = 0;
  for (const trip of endedTrips) {
    const openDeals = await db
      .select({ id: dealsTable.id })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, trip.tenantId),
          eq(dealsTable.tripId, trip.id),
          eq(dealsTable.status, DEAL_STATUS.OPEN),
        ),
      );

    for (const deal of openDeals) {
      await moveDealToStage({
        tenantId: trip.tenantId,
        dealId: deal.id,
        targetStageName: "Pós Viagem",
        forwardOnly: true,
      });
      moved++;
    }
  }

  logger.info({ moved }, "[pipeline-automation] Trip-ended cron complete");
}
