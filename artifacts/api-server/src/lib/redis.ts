import { Redis } from "ioredis";
import { logger } from "./logger";

let _connection: Redis | null = null;
export let isQueueEnabled = false;

// ─── Transient error tracking ─────────────────────────────────────────────────
// We count consecutive transient Redis errors in-memory so the system-health
// endpoint can surface a meaningful status without a DB write.
let _consecutiveTransientErrors = 0;
let _lastTransientErrorAt: number | null = null;
const DEGRADED_THRESHOLD = 3;    // ≥3 consecutive errors → degraded
const UNAVAILABLE_THRESHOLD = 10; // ≥10 consecutive errors → unavailable
// If the connection has been healthy for this many ms, auto-clear degraded state.
const ERROR_DECAY_MS = 5 * 60 * 1000; // 5 minutes

export function recordTransientRedisError(): void {
  _consecutiveTransientErrors++;
  _lastTransientErrorAt = Date.now();
}

export function resetTransientRedisErrors(): void {
  _consecutiveTransientErrors = 0;
  _lastTransientErrorAt = null;
}

export function getRedisStatus(): "ok" | "degraded" | "unavailable" {
  if (!process.env["REDIS_URL"]?.trim()) return "ok"; // Redis not configured — not applicable

  // If the connection is currently ready AND the last transient error is old
  // enough, treat the service as recovered — even if the counter hasn't been
  // reset by a full disconnect/reconnect cycle.
  if (
    _connection?.status === "ready" &&
    _lastTransientErrorAt !== null &&
    Date.now() - _lastTransientErrorAt > ERROR_DECAY_MS
  ) {
    return "ok";
  }

  if (_consecutiveTransientErrors >= UNAVAILABLE_THRESHOLD) return "unavailable";
  if (_consecutiveTransientErrors >= DEGRADED_THRESHOLD) return "degraded";
  // Also treat a non-ready connection with any errors as degraded
  if (_connection && _connection.status !== "ready" && _consecutiveTransientErrors > 0) return "degraded";
  return "ok";
}

/**
 * Returns true when an ioredis/BullMQ error looks transient — i.e. the kind
 * of error that is expected to resolve on its own (rate-limited, connection
 * refused while Redis restarts, network hiccup, etc.).  These are logged at
 * WARN level to avoid masking genuine application bugs.
 */
export function isTransientRedisError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("rate limit") ||
    msg.includes("ratelimit") ||
    msg.includes("max daily request limit") ||
    msg.includes("max requests limit exceeded") ||
    msg.includes("maxretriesperrequest") ||
    msg.includes("connection is closed") ||
    msg.includes("stream isn't writeable")
  );
}

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
        // Exponential back-off reconnection strategy: 500 ms → 1 s → 2 s → … → 30 s cap.
        // Returning a positive number tells ioredis to wait that many ms before the
        // next reconnect attempt.  We never return null so the client keeps trying
        // indefinitely — Upstash rate limits and transient network issues are
        // expected to clear within minutes.
        //
        // Log throttling: emit a message for the first 3 attempts (so problems
        // are noticed quickly), then only at every 10th attempt thereafter,
        // to avoid flooding logs during prolonged outages.
        retryStrategy: (times: number) => {
          const delayMs = Math.min(500 * Math.pow(2, times - 1), 30_000);
          const shouldLog = times <= 3 || times % 10 === 0;
          if (shouldLog) {
            logger.warn({ attempt: times, delayMs }, "[redis] Reconnecting with exponential back-off");
          }
          return delayMs;
        },
      });

      _connection.on("connect", () => {
        isQueueEnabled = true;
        resetTransientRedisErrors();
        logger.info("[redis] Connected");
      });

      _connection.on("ready", () => {
        resetTransientRedisErrors();
      });

      _connection.on("error", (err: Error) => {
        if (isTransientRedisError(err)) {
          recordTransientRedisError();
          logger.warn({ err }, "[redis] Transient error (will retry)");
        } else {
          logger.error({ err }, "[redis] Error");
        }
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
