ALTER TABLE "passengers" ADD COLUMN IF NOT EXISTS "boarding_location_id" text;
--> statement-breakpoint
ALTER TABLE "passengers" ADD COLUMN IF NOT EXISTS "disembark_location_id" text;
