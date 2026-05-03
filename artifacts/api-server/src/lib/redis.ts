import { Redis } from "ioredis";
import { logger } from "./logger";

let _connection: Redis | null = null;
export let isQueueEnabled = false;

export function getRedisConnection(): Redis | null {
  const raw = process.env["REDIS_URL"]?.trim();
  if (!raw) return null;

  // Extract the canonical URL from values that may be a redis-cli command
  // e.g. "redis-cli --tls -u rediss://..." → "rediss://..."
  const urlMatch = raw.match(/(rediss?:\/\/\S+)/);
  const url = urlMatch ? urlMatch[1] : raw;

  // Enable TLS when the scheme is rediss:// OR when the host is a known managed
  // Redis provider that requires TLS (e.g. Upstash). Passing tls:{} lets Node
  // use its built-in CA bundle so the server certificate is fully verified.
  const knownTlsHosts = [".upstash.io", ".redis.cache.windows.net", ".redislabs.com"];
  let parsedHost = "";
  try { parsedHost = new URL(url.replace(/^redis:\/\//, "https://")).hostname; } catch { /* ignore */ }
  const useTls = url.startsWith("rediss://") || knownTlsHosts.some((h) => parsedHost.endsWith(h));

  if (!_connection) {
    try {
      _connection = new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: false,
        ...(useTls ? { tls: {} } : {}),
      });

      _connection.on("connect", () => {
        isQueueEnabled = true;
        logger.info("[redis] Connected");
      });

      _connection.on("error", (err: Error) => {
        logger.error({ err }, "[redis] Error");
      });

      _connection.on("close", () => {
        logger.warn("[redis] Connection closed");
      });

    } catch (err) {
      logger.error({ err }, "[redis] Failed to create connection");
      _connection = null;
    }
  }

  return _connection;
}

export async function closeRedisConnection(): Promise<void> {
  if (_connection) {
    await _connection.quit().catch(() => {});
    _connection = null;
    isQueueEnabled = false;
  }
}
