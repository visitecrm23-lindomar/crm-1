ALTER TABLE "referral_settings" ADD COLUMN "whatsapp_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "referral_settings" ADD COLUMN "whatsapp_converted_message" text;
ALTER TABLE "referral_settings" ADD COLUMN "whatsapp_bonus_paid_message" text;
