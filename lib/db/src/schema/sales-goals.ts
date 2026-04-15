import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const salesGoalsTable = pgTable("sales_goals", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  goalAmount: numeric("goal_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  achievedAmount: numeric("achieved_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SalesGoal = typeof salesGoalsTable.$inferSelect;
export type InsertSalesGoal = typeof salesGoalsTable.$inferInsert;
