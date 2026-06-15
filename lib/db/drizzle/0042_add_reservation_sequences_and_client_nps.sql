CREATE TABLE IF NOT EXISTS "reservation_sequences" (
  "tenant_id" text NOT NULL,
  "year_month" text NOT NULL,
  "type_code" text NOT NULL,
  "last_num" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "reservation_sequences_pkey" PRIMARY KEY("tenant_id","year_month","type_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_nps_responses" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "client_id" text NOT NULL,
  "reservation_id" text NOT NULL,
  "trip_id" text,
  "score" integer NOT NULL,
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_nps_responses_reservation_id_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
ALTER TABLE "client_nps_responses" ADD CONSTRAINT "client_nps_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_nps_responses" ADD CONSTRAINT "client_nps_responses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_nps_client_id_idx" ON "client_nps_responses" USING btree ("client_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_nps_tenant_id_idx" ON "client_nps_responses" USING btree ("tenant_id","created_at");
