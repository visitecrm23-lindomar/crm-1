ALTER TABLE "clients" ADD COLUMN "customer_code" text;
ALTER TABLE "tenants" ADD COLUMN "last_client_seq" integer NOT NULL DEFAULT 0;

-- Uniqueness is per-tenant: two agencies can share same prefix, codes are unique within each agency
CREATE UNIQUE INDEX "clients_customer_code_unique" ON "clients" ("tenant_id", "customer_code") WHERE "customer_code" IS NOT NULL;

-- Backfill existing clients with customer codes based on creation order per tenant
-- UPPER() applied to reservation_prefix for consistency with runtime generation
WITH ranked AS (
  SELECT
    c.id,
    UPPER(COALESCE(
      NULLIF(TRIM(t.reservation_prefix), ''),
      LEFT(t.slug, 3),
      'CLI'
    )) AS prefix,
    TO_CHAR(c.created_at, 'YYYYMM') AS yyyymm,
    ROW_NUMBER() OVER (PARTITION BY c.tenant_id ORDER BY c.created_at, c.id) AS seq
  FROM clients c
  JOIN tenants t ON t.id = c.tenant_id
)
UPDATE clients c
SET customer_code = r.prefix || '-' || r.yyyymm || '-' || LPAD(r.seq::text, 5, '0')
FROM ranked r
WHERE c.id = r.id;

-- Update last_client_seq on tenants to match current total client count per tenant
UPDATE tenants t
SET last_client_seq = (
  SELECT COUNT(*) FROM clients c WHERE c.tenant_id = t.id
);
