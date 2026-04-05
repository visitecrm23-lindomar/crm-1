import { pgTable, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { reservationsTable } from "./reservations";
import { clientsTable } from "./clients";
import { tripsTable } from "./trips";
import { usersTable } from "./users";

export const paymentsTable = pgTable("payments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  reservationId: text("reservation_id").references(() => reservationsTable.id),
  clientId: text("client_id").references(() => clientsTable.id),
  orderId: text("order_id"),
  type: text("type").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  installmentNumber: integer("installment_number").notNull().default(1),
  totalInstallments: integer("total_installments").notNull().default(1),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  receiptUrl: text("receipt_url"),
  gateway: text("gateway"),
  transactionId: text("transaction_id"),
  description: text("description"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;

export const paymentsRelations = relations(paymentsTable, ({ one }) => ({
  tenant: one(tenantsTable, { fields: [paymentsTable.tenantId], references: [tenantsTable.id] }),
  reservation: one(reservationsTable, { fields: [paymentsTable.reservationId], references: [reservationsTable.id] }),
  client: one(clientsTable, { fields: [paymentsTable.clientId], references: [clientsTable.id] }),
}));

export const expensesTable = pgTable("expenses", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  tripId: text("trip_id").references(() => tripsTable.id),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  supplierId: text("supplier_id"),
  paymentMethod: text("payment_method"),
  paymentDate: timestamp("payment_date", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  receiptUrl: text("receipt_url"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdById: text("created_by_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ createdAt: true, updatedAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;

export const expensesRelations = relations(expensesTable, ({ one }) => ({
  tenant: one(tenantsTable, { fields: [expensesTable.tenantId], references: [tenantsTable.id] }),
  trip: one(tripsTable, { fields: [expensesTable.tripId], references: [tripsTable.id] }),
  createdBy: one(usersTable, { fields: [expensesTable.createdById], references: [usersTable.id] }),
}));
