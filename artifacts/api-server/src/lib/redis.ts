import { Redis } from "ioredis";
import { logger } from "./logger";

let _connection: Redis | null = null;
export let isQueueEnabled = false;

export function getRedisConnection(): Redis | null {
  const url = process.env["REDIS_URL"];
  if (!url) return null;

  if (!_connection) {
    try {
      _connection = new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: false,
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

      isQueueEnabled = true;
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
