CREATE TABLE IF NOT EXISTS "client_scores" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "purchase_score" integer NOT NULL DEFAULT 0,
  "recompra_score" integer NOT NULL DEFAULT 0,
  "churn_score" integer NOT NULL DEFAULT 0,
  "nbo_trip_id" text REFERENCES "trips"("id") ON DELETE SET NULL,
  "nbo_reasoning" text,
  "rfm_r" integer,
  "rfm_f" integer,
  "rfm_m" numeric(12, 2),
  "calculated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_scores_client_tenant_unique" ON "client_scores" ("client_id", "tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_scores_tenant_idx" ON "client_scores" ("tenant_id", "calculated_at");
