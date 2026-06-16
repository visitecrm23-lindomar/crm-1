INSERT INTO platform_settings (id, key, value, label, description, type, updated_at)
VALUES (
  'ps_redis_alert_email',
  'redis_alert_email',
  NULL,
  'E-mail de alerta do Redis',
  'Endereço de e-mail que recebe alertas de infraestrutura do Redis. Se vazio, usa a variável de ambiente SUPERADMIN_EMAIL.',
  'string',
  NOW()
) ON CONFLICT (key) DO NOTHING;
