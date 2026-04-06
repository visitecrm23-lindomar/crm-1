/**
 * Clerk Frontend API Proxy Middleware
 *
 * Proxies Clerk Frontend API requests through your domain, enabling Clerk
 * authentication on custom domains and .replit.app deployments without
 * requiring CNAME DNS configuration.
 *
 * See: https://clerk.com/docs/guides/dashboard/dns-domains/proxy-fapi
 *
 * Required environment variables:
 *   CLERK_SECRET_KEY  — Clerk secret key (activates the proxy)
 *   CLERK_PROXY_URL   — The canonical proxy URL configured in the Clerk dashboard
 *                       e.g. https://visite-crm.replit.app/api/__clerk
 *
 * IMPORTANT:
 * - Must be mounted BEFORE express.json() middleware
 * - CLERK_PROXY_URL must match the proxy URL configured in the Clerk dashboard
 * - The proxy rewrites CORS response headers so any allowed origin can call it
 *
 * Usage in app.ts:
 *   import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
 *   app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import type { RequestHandler } from "express";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

export function clerkProxyMiddleware(allowedOrigins?: Set<string>): RequestHandler {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  const configuredProxyUrl = process.env.CLERK_PROXY_URL;
  if (!configuredProxyUrl) {
    return (_req, _res, next) => next();
  }

  let proxyOrigin: string;
  try {
    proxyOrigin = new URL(configuredProxyUrl).origin;
  } catch {
    console.error(`[clerkProxy] Invalid CLERK_PROXY_URL: "${configuredProxyUrl}". Proxy disabled.`);
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader("Clerk-Proxy-Url", configuredProxyUrl);
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);
        proxyReq.setHeader("Origin", proxyOrigin);

        const xff = req.headers["x-forwarded-for"];
        const clientIp =
          (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "";
        if (clientIp) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
        }
      },
      proxyRes: (proxyRes, req) => {
        const browserOrigin = (req as { headers: Record<string, string> }).headers["origin"];
        if (browserOrigin && (!allowedOrigins || allowedOrigins.has(browserOrigin))) {
          proxyRes.headers["access-control-allow-origin"] = browserOrigin;
          proxyRes.headers["access-control-allow-credentials"] = "true";
          proxyRes.headers["vary"] = "origin";
        }
      },
    },
  }) as RequestHandler;
}
