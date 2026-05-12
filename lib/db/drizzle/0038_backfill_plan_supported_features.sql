UPDATE "plans" SET "supported_features" = '["coupons"]'::json       WHERE "slug" = 'starter'    AND "supported_features" = '[]'::json;
UPDATE "plans" SET "supported_features" = '["referrals","coupons"]'::json WHERE "slug" = 'pro'         AND "supported_features" = '[]'::json;
UPDATE "plans" SET "supported_features" = '["referrals","coupons"]'::json WHERE "slug" = 'enterprise'  AND "supported_features" = '[]'::json;
