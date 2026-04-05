import { pgTable, text, timestamp, boolean, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pipelineStagesTable = pgTable("pipeline_stages", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  pipelineId: text("pipeline_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  order: integer("order").notNull(),
  isFinal: boolean("is_final").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPipelineStageSchema = createInsertSchema(pipelineStagesTable).omit({ createdAt: true });
export type InsertPipelineStage = z.infer<typeof insertPipelineStageSchema>;
export type PipelineStage = typeof pipelineStagesTable.$inferSelect;

export const dealsTable = pgTable("deals", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  stageId: text("stage_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  clientId: text("client_id"),
  leadName: text("lead_name"),
  leadEmail: text("lead_email"),
  leadWhatsapp: text("lead_whatsapp"),
  tripId: text("trip_id"),
  ownerId: text("owner_id").notNull(),
  expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  status: text("status").notNull().default("open"),
  lostReason: text("lost_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDealSchema = createInsertSchema(dealsTable).omit({ createdAt: true, updatedAt: true });
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;
