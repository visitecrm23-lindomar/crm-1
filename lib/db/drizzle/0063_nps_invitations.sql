-- Migration 0063: NPS invitations table for auto-send tracking and idempotency
CREATE TABLE IF NOT EXISTS "nps_invitations" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "reservation_id" text NOT NULL,
  "trip_id" text,
  "token" text NOT NULL,
  "invited_at" timestamp with time zone NOT NULL DEFAULT now(),
  "responded_at" timestamp with time zone,
  CONSTRAINT "nps_invitations_token_unique" UNIQUE("token"),
  CONSTRAINT "nps_invitations_reservation_id_unique" UNIQUE("reservation_id")
);
CREATE INDEX IF NOT EXISTS "nps_inv_tenant_idx" ON "nps_invitations"("tenant_id", "invited_at");
