-- Migration 0064: Reservation installments table for granular installment tracking
CREATE TABLE IF NOT EXISTS "reservation_installments" (
  "id" text PRIMARY KEY,
  "reservation_id" text NOT NULL REFERENCES "reservations"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "installment_number" integer NOT NULL,
  "due_date" timestamp with time zone NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "paid_amount" numeric(10, 2),
  "paid_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "res_inst_reservation_idx" ON "reservation_installments"("reservation_id");
CREATE INDEX IF NOT EXISTS "res_inst_tenant_due_idx" ON "reservation_installments"("tenant_id", "due_date");
