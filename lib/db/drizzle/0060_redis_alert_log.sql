CREATE TABLE IF NOT EXISTS "redis_alert_log" (
  "id" text PRIMARY KEY NOT NULL,
  "event_type" text NOT NULL,
  "alert_status" text,
  "email_to" text,
  "triggered_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO platform_settings (id, key, value, label, description, type, updated_at)
VALUES (
  'ps_redis_alert_on_degraded',
  'redis_alert_on_degraded',
  'true',
  'Alertar quando Redis ficar degradado',
  'Envia e-mail de alerta quando o Redis detecta erros transitórios consecutivos (status degradado).',
  'boolean',
  NOW()
),
(
  'ps_redis_alert_on_daily_limit',
  'redis_alert_on_daily_limit',
  'true',
  'Alertar quando Redis atingir limite diário',
  'Envia e-mail de alerta quando o uso diário do Redis (Upstash free tier) se aproximar do limite.',
  'boolean',
  NOW()
)
ON CONFLICT (key) DO NOTHING;
