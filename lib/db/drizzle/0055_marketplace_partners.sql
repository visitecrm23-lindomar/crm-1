-- Migration 0055: Marketplace Turístico e Portal do Parceiro
-- Tables: partners, partner_products, partner_availability, partner_commissions
-- Also adds partner_product_id to store_products

-- ─── partners ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partners" (
  "id"              text PRIMARY KEY,
  "tenant_id"       text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name"            text NOT NULL,
  "email"           text NOT NULL,
  "cnpj"            text,
  "slug"            text NOT NULL,
  "description"     text,
  "phone"           text,
  "logo"            text,
  "status"          text NOT NULL DEFAULT 'pending',
  "commission_pct"  numeric(5, 2) NOT NULL DEFAULT '30',
  "password_hash"   text,
  "created_at"      timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"      timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "partners_tenant_email_idx" ON "partners"("tenant_id", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "partners_tenant_slug_idx"  ON "partners"("tenant_id", "slug");

-- ─── partner_products ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partner_products" (
  "id"                   text PRIMARY KEY,
  "partner_id"           text NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "tenant_id"            text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "type"                 text NOT NULL DEFAULT 'passeio',
  "title"                text NOT NULL,
  "slug"                 text NOT NULL,
  "description"          text,
  "price"                numeric(10, 2) NOT NULL DEFAULT '0',
  "max_capacity"         integer NOT NULL DEFAULT 10,
  "duration_minutes"     integer,
  "meeting_point"        text,
  "cancellation_policy"  text,
  "images"               json NOT NULL DEFAULT '[]',
  "status"               text NOT NULL DEFAULT 'pending',
  "created_at"           timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"           timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "partner_products_partner_idx" ON "partner_products"("partner_id");
CREATE INDEX IF NOT EXISTS "partner_products_tenant_idx"  ON "partner_products"("tenant_id");

-- ─── partner_availability ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partner_availability" (
  "id"          text PRIMARY KEY,
  "product_id"  text NOT NULL REFERENCES "partner_products"("id") ON DELETE CASCADE,
  "date"        text NOT NULL,
  "spots_total" integer NOT NULL DEFAULT 10,
  "spots_used"  integer NOT NULL DEFAULT 0,
  "created_at"  timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"  timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_avail_product_date_idx" ON "partner_availability"("product_id", "date");

-- ─── partner_commissions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partner_commissions" (
  "id"             text PRIMARY KEY,
  "order_id"       text NOT NULL REFERENCES "store_orders"("id") ON DELETE CASCADE,
  "partner_id"     text NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "tenant_id"      text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "gross_amount"   numeric(10, 2) NOT NULL,
  "partner_amount" numeric(10, 2) NOT NULL,
  "agency_amount"  numeric(10, 2) NOT NULL,
  "status"         text NOT NULL DEFAULT 'pending',
  "period"         text NOT NULL,
  "paid_at"        timestamptz,
  "created_at"     timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"     timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "partner_commissions_partner_idx" ON "partner_commissions"("partner_id");
CREATE INDEX IF NOT EXISTS "partner_commissions_order_idx"   ON "partner_commissions"("order_id");
CREATE INDEX IF NOT EXISTS "partner_commissions_period_idx"  ON "partner_commissions"("tenant_id", "period");

-- ─── store_products: add partner_product_id ───────────────────────────────────
ALTER TABLE "store_products"
  ADD COLUMN IF NOT EXISTS "partner_product_id" text REFERENCES "partner_products"("id") ON DELETE SET NULL;
