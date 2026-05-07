import type { Request } from "express";

const TRUSTED_PROXY_CIDRS = [
  "127.0.0.1",
  "::1",
  "10.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
];

function isTrustedProxy(ip: string): boolean {
  return TRUSTED_PROXY_CIDRS.some((prefix) => ip.startsWith(prefix));
}

/**
 * Extract the real client IP from an Express request.
 *
 * Express is configured with `trust proxy: 1`, so `req.ip` already performs
 * one-hop XFF resolution. We use it as the primary source and fall back to
 * the raw socket address for local/test environments.
 *
 * When XFF contains a chain of IPs we also walk it left-to-right to find the
 * first non-trusted-proxy address, giving an additional safety net against
 * spoofed headers injected deeper in the chain.
 */
export function getClientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const ips = (Array.isArray(xff) ? xff.join(",") : xff)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const ip of ips) {
      if (ip && !isTrustedProxy(ip)) {
        return ip;
      }
    }
  }

  const expressIp = req.ip;
  if (expressIp && !isTrustedProxy(expressIp)) {
    return expressIp;
  }

  return req.socket?.remoteAddress ?? null;
}
