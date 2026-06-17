-- Fix: customer_code uniqueness must be scoped per-tenant, not globally.
-- Two tenants sharing the same reservationPrefix would collide on the global index.
DROP INDEX IF EXISTS "clients_customer_code_unique";
CREATE UNIQUE INDEX "clients_customer_code_unique" ON "clients" ("tenant_id", "customer_code") WHERE "customer_code" IS NOT NULL;
