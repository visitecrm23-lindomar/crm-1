ALTER TABLE "referral_campaigns"
  ADD CONSTRAINT "referral_campaigns_ends_after_starts" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "referral_campaigns_bonus_type_check" CHECK ("bonus_type" IN ('flat', 'multiplier'));
