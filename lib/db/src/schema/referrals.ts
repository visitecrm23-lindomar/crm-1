import { pgTable, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referralsTable = pgTable("referrals", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  referrerId: text("referrer_id").notNull(),
  referredId: text("referred_id"),
  referredEmail: text("referred_email"),
  code: text("code").notNull(),
  status: text("status").notNull().default("pending"),
  bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  bonusPaid: boolean("bonus_paid").notNull().default(false),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ createdAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
