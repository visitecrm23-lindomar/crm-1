import { pgTable, text, timestamp, boolean, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reservationsTable = pgTable("reservations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  tripId: text("trip_id").notNull(),
  clientId: text("client_id").notNull(),
  seats: text("seats").array().notNull().default([]),
  boardingLocationId: text("boarding_location_id"),
  tripType: text("trip_type"),
  packageType: text("package_type"),
  hasInsurance: boolean("has_insurance").notNull().default(false),
  totalValue: numeric("total_value", { precision: 10, scale: 2 }).notNull(),
  paidValue: numeric("paid_value", { precision: 10, scale: 2 }).notNull().default("0"),
  balance: numeric("balance", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  installments: integer("installments").notNull().default(1),
  commissionPercentage: numeric("commission_percentage", { precision: 5, scale: 2 }),
  commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("pending"),
  voucherCode: text("voucher_code").notNull().unique(),
  qrCode: text("qr_code").notNull(),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdById: text("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReservationSchema = createInsertSchema(reservationsTable).omit({ createdAt: true, updatedAt: true });
export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Reservation = typeof reservationsTable.$inferSelect;

export const passengersTable = pgTable("passengers", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull(),
  name: text("name").notNull(),
  cpf: text("cpf"),
  rg: text("rg"),
  birthDate: timestamp("birth_date", { withTimezone: true }),
  ageCategory: text("age_category").notNull().default("adult"),
  seatNumber: text("seat_number"),
  isChildUnder7: boolean("is_child_under_7").notNull().default(false),
});

export const insertPassengerSchema = createInsertSchema(passengersTable);
export type InsertPassenger = z.infer<typeof insertPassengerSchema>;
export type Passenger = typeof passengersTable.$inferSelect;
