-- Migration 0012: per-order one-shot token used to authorise the storefront
-- to attach a gateway paymentIntentId to an order. The token is generated
-- server-side at order creation and returned in the order POST response, so
-- only the legitimate caller can later POST it back to the
-- /payment-intent attachment endpoint. This prevents an attacker who only
-- knows the (orderNumber, customerEmail) tuple from poisoning the order
-- with a bogus gateway reference.
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS payment_token text;
