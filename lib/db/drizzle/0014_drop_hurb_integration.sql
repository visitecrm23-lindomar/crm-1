-- Remove dead Hurb integration schema. The integration was never wired into
-- product/runtime code (no active routes, workers, or flows used these tables).
-- Drop in FK-safe order: bookings -> products -> integrations.
DROP TABLE IF EXISTS "hurb_bookings";
DROP TABLE IF EXISTS "hurb_products";
DROP TABLE IF EXISTS "hurb_integrations";

-- The stores.hurb_enabled flag was a leftover toggle for the same dead
-- integration; removing it keeps the stores schema in sync with the schema
-- definition.
ALTER TABLE "stores" DROP COLUMN IF EXISTS "hurb_enabled";
