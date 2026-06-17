-- Restore global uniqueness for customer_code as per spec ("único na plataforma").
-- In dev the index was temporarily changed to per-tenant by migration 0067; this fixes it.
-- In fresh prod installs, DROP IF EXISTS is a safe no-op.
DROP INDEX IF EXISTS "clients_customer_code_unique";
CREATE UNIQUE INDEX "clients_customer_code_unique" ON "clients" ("customer_code") WHERE "customer_code" IS NOT NULL;
