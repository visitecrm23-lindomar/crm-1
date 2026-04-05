import { pgTable, text, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  tenantId: text("tenant_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  cpf: text("cpf"),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("agencia"),
  isActive: boolean("is_active").notNull().default(true),
  referralCode: text("referral_code").notNull().unique(),
  referralBalance: numeric("referral_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
