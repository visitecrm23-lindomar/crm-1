import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { clientsTable } from "./clients";

export const clientNpsResponsesTable = pgTable(
  "client_nps_responses",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
    reservationId: text("reservation_id").notNull().unique(),
    tripId: text("trip_id"),
    score: integer("score").notNull(),
    scoreTransport: integer("score_transport"),
    scoreService: integer("score_service"),
    scoreOrganization: integer("score_organization"),
    scoreGuide: integer("score_guide"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("client_nps_client_id_idx").on(table.clientId, table.createdAt),
    index("client_nps_tenant_id_idx").on(table.tenantId, table.createdAt),
  ],
);

export type ClientNpsResponse = typeof clientNpsResponsesTable.$inferSelect;
export type InsertClientNpsResponse = typeof clientNpsResponsesTable.$inferInsert;
