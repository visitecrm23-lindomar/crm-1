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
 *   app.use(CLERK_PROXY_PATH, clerkProxyMiddleware(isAllowedOrigin));
 */

// Note: http-proxy-middleware@3 depends on http-proxy@1.18.1, which is effectively
// unmaintained and contains two hardcoded deprecated Node.js APIs:
//   • DEP0169 — `url.parse()` in http-proxy/lib/http-proxy/index.js
//   • DEP0060 — `util._extend()` in http-proxy/lib/http-proxy/common.js and index.js
// These warnings appear at server startup whenever the proxy middleware is loaded.
// There is no newer http-proxy release that removes them, and replacing
// http-proxy-middleware entirely is out of scope for this sprint.
// Track: https://github.com/http-party/node-http-proxy/issues/1591
import { createProxyMiddleware } from "http-proxy-middleware";
import type { RequestHandler } from "express";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

export function clerkProxyMiddleware(isAllowedOrigin?: (origin: string) => boolean): RequestHandler {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.warn("[clerkProxy] CLERK_SECRET_KEY is not set. Clerk proxy disabled — auth will not work.");
    return (_req, _res, next) => next();
  }

  const configuredProxyUrl = process.env.CLERK_PROXY_URL;
  if (!configuredProxyUrl) {
    console.warn("[clerkProxy] CLERK_PROXY_URL is not set. Clerk proxy disabled — auth will not work.");
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
        if (browserOrigin && (!isAllowedOrigin || isAllowedOrigin(browserOrigin))) {
          proxyRes.headers["access-control-allow-origin"] = browserOrigin;
          proxyRes.headers["access-control-allow-credentials"] = "true";
          proxyRes.headers["vary"] = "origin";
        }
      },
    },
  }) as RequestHandler;
}
