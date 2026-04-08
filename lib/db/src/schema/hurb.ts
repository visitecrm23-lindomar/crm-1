import { pgTable, text, timestamp, boolean, numeric, integer, json } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./store";
import { clientsTable } from "./clients";

export const hurbIntegrationsTable = pgTable("hurb_integrations", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().unique().references(() => storesTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull(),

  apiKey: text("api_key").notNull(),
  apiSecret: text("api_secret").notNull(),
  partnerId: text("partner_id").notNull(),

  isActive: boolean("is_active").notNull().default(true),
  autoSync: boolean("auto_sync").notNull().default(true),
  syncInterval: integer("sync_interval").notNull().default(60),

  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("10"),

  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  lastSyncError: text("last_sync_error"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHurbIntegrationSchema = createInsertSchema(hurbIntegrationsTable).omit({ createdAt: true, updatedAt: true });
export type InsertHurbIntegration = z.infer<typeof insertHurbIntegrationSchema>;
export type HurbIntegration = typeof hurbIntegrationsTable.$inferSelect;

export const hurbProductsTable = pgTable("hurb_products", {
  id: text("id").primaryKey(),
  integrationId: text("integration_id").notNull().references(() => hurbIntegrationsTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull(),

  hurbId: text("hurb_id").notNull(),
  hurbSku: text("hurb_sku").notNull(),

  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  destination: text("destination").notNull(),
  category: text("category").notNull(),

  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: numeric("original_price", { precision: 10, scale: 2 }),
  currency: text("currency").notNull().default("BRL"),

  available: boolean("available").notNull().default(true),
  stock: integer("stock"),

  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),

  images: json("images").$type<string[]>().notNull().default([]),
  thumbnail: text("thumbnail"),

  hurbCity: text("hurb_city"),
  hurbState: text("hurb_state"),
  country: text("country").notNull().default("Brasil"),

  durationDays: integer("duration_days"),
  includes: json("includes").$type<string[]>().notNull().default([]),
  excludes: json("excludes").$type<string[]>().notNull().default([]),

  rating: numeric("rating", { precision: 3, scale: 2 }),
  reviewsCount: integer("reviews_count").notNull().default(0),

  slug: text("slug").notNull(),

  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  syncStatus: text("sync_status").notNull().default("synced"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHurbProductSchema = createInsertSchema(hurbProductsTable).omit({ createdAt: true, updatedAt: true });
export type InsertHurbProduct = z.infer<typeof insertHurbProductSchema>;
export type HurbProduct = typeof hurbProductsTable.$inferSelect;

export const hurbBookingsTable = pgTable("hurb_bookings", {
  id: text("id").primaryKey(),
  integrationId: text("integration_id").notNull().references(() => hurbIntegrationsTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull(),

  hurbBookingId: text("hurb_booking_id").notNull().unique(),
  hurbProductId: text("hurb_product_id").notNull(),

  clientId: text("client_id").references(() => clientsTable.id),

  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerCpf: text("customer_cpf").notNull(),

  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  commission: numeric("commission", { precision: 10, scale: 2 }).notNull(),
  netAmount: numeric("net_amount", { precision: 10, scale: 2 }).notNull(),

  status: text("status").notNull().default("pending"),

  bookingDate: timestamp("booking_date", { withTimezone: true }).notNull(),
  checkinDate: timestamp("checkin_date", { withTimezone: true }),
  checkoutDate: timestamp("checkout_date", { withTimezone: true }),

  voucherCode: text("voucher_code"),
  voucherUrl: text("voucher_url"),

  reservationId: text("reservation_id").unique(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHurbBookingSchema = createInsertSchema(hurbBookingsTable).omit({ createdAt: true, updatedAt: true });
export type InsertHurbBooking = z.infer<typeof insertHurbBookingSchema>;
export type HurbBooking = typeof hurbBookingsTable.$inferSelect;

export const hurbIntegrationsRelations = relations(hurbIntegrationsTable, ({ one, many }) => ({
  store: one(storesTable, { fields: [hurbIntegrationsTable.storeId], references: [storesTable.id] }),
  products: many(hurbProductsTable),
  bookings: many(hurbBookingsTable),
}));

export const hurbProductsRelations = relations(hurbProductsTable, ({ one }) => ({
  integration: one(hurbIntegrationsTable, { fields: [hurbProductsTable.integrationId], references: [hurbIntegrationsTable.id] }),
}));

export const hurbBookingsRelations = relations(hurbBookingsTable, ({ one }) => ({
  integration: one(hurbIntegrationsTable, { fields: [hurbBookingsTable.integrationId], references: [hurbIntegrationsTable.id] }),
  client: one(clientsTable, { fields: [hurbBookingsTable.clientId], references: [clientsTable.id] }),
}));
