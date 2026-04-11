ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "discount_coupon_code" text;
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "discount_coupon_amount" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "discount_loyalty_points" integer;
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "discount_loyalty_amount" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "discount_referral_code" text;
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "discount_referral_amount" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "discount_total" numeric(10, 2);
