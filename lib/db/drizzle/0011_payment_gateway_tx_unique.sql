-- Migration 0011: idempotency guarantee for gateway-driven payments.
-- Webhook handlers (Stripe, MercadoPago) rely on uniqueness of
-- (tenant_id, gateway, transaction_id, reservation_id) to prevent duplicate
-- Payment rows when the same event is delivered more than once. The
-- reservation_id is included so a single gateway transaction that splits
-- across multiple reservations of the same order can legitimately produce
-- one row per reservation, while a true replay (same tenant/gateway/tx for
-- the same reservation) is rejected at the DB level. The partial filter
-- excludes legacy manually-entered payments where gateway/transaction_id
-- are NULL.
CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_gateway_tx_reservation_uidx
  ON payments (tenant_id, gateway, transaction_id, reservation_id)
  WHERE gateway IS NOT NULL AND transaction_id IS NOT NULL;
