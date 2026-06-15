ALTER TABLE "client_nps_responses" ADD COLUMN IF NOT EXISTS "score_transport" integer;
--> statement-breakpoint
ALTER TABLE "client_nps_responses" ADD COLUMN IF NOT EXISTS "score_service" integer;
--> statement-breakpoint
ALTER TABLE "client_nps_responses" ADD COLUMN IF NOT EXISTS "score_organization" integer;
--> statement-breakpoint
ALTER TABLE "client_nps_responses" ADD COLUMN IF NOT EXISTS "score_guide" integer;
