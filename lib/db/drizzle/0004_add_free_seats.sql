ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "free_organizers" integer;
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "free_guides" integer;
