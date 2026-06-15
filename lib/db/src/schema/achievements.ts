import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { tripsTable } from "./trips";

export const tripMediaTable = pgTable(
  "trip_media",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => tripsTable.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    type: text("type").notNull().default("image"),
    caption: text("caption"),
    uploadedByUserId: text("uploaded_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("trip_media_trip_idx").on(table.tripId, table.createdAt),
    index("trip_media_tenant_idx").on(table.tenantId),
  ],
);

export type TripMedia = typeof tripMediaTable.$inferSelect;
