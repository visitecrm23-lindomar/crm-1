import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import path from "node:path";
import { clerkMiddleware } from "@clerk/express";
import rateLimit from "express-rate-limit";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import { requestId, errorHandler } from "./middlewares/errorHandler";
import router from "./routes";
import { logger } from "./lib/logger";
import { handleStripeWebhook } from "./lib/stripeWebhookHandler";

const app: Express = express();

app.set("trust proxy", 1);

app.use(requestId);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const isDev = process.env["NODE_ENV"] !== "production";

const additionalOrigins = (process.env["ADDITIONAL_ORIGINS"] ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// REPLIT_DOMAINS is a platform-managed secret containing all domains attached to this
// deployment (custom domains + the generated .replit.app subdomain), comma-separated.
// Parsing it here ensures every domain gets CORS + Clerk authorizedParties coverage
// automatically, without having to enumerate each one manually in ADDITIONAL_ORIGINS.
const replitDomains = (process.env["REPLIT_DOMAINS"] ?? "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean)
  .map((d) => (d.startsWith("https://") || d.startsWith("http://") ? d : `https://${d}`));

const ALLOWED_ORIGINS = new Set(
  [
    process.env["FRONTEND_URL"],
    process.env["REPLIT_DEV_DOMAIN"] ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` : undefined,
    ...replitDomains,
    ...additionalOrigins,
  ].filter(Boolean) as string[]
);

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (isDev) {
    try {
      const url = new URL(origin);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    } catch {
      // ignore invalid origin
    }
  }
  return false;
}

if (ALLOWED_ORIGINS.size === 0 && !isDev) {
  logger.warn(
    "⚠️  CORS: No allowed origins configured. Set FRONTEND_URL or ensure REPLIT_DEV_DOMAIN is set. " +
    "Browser API calls from external origins will be blocked. " +
    "Only same-origin requests (no Origin header) will succeed."
  );
}

if (!process.env["CLERK_SECRET_KEY"]) {
  logger.warn("⚠️  CLERK_SECRET_KEY is not set. Clerk authentication will not work. Re-run Clerk setup to provision keys.");
}

// In development, always derive CLERK_PROXY_URL from the current REPLIT_DEV_DOMAIN
// so stale secrets or env vars pointing to old Replit URLs don't break auth.
if (isDev && process.env["REPLIT_DEV_DOMAIN"]) {
  process.env["CLERK_PROXY_URL"] = `https://${process.env["REPLIT_DEV_DOMAIN"]}/api/__clerk`;
  logger.info(`[clerkProxy] Dev: CLERK_PROXY_URL set from REPLIT_DEV_DOMAIN → ${process.env["CLERK_PROXY_URL"]}`);
} else if (!process.env["CLERK_PROXY_URL"]) {
  logger.warn("⚠️  CLERK_PROXY_URL is not set. Clerk proxy disabled — auth will not work.");
}

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware(isAllowedOrigin));

// ── Stripe webhook — MUST be registered BEFORE express.json() ──
// The rawBody is also captured via the verify hook below, which covers
// the existing /api/webhooks/stripe route. This dedicated route uses
// express.raw() as a belt-and-suspenders approach.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => void handleStripeWebhook(req, res),
);

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
}));
app.use(cookieParser());
app.use(
  express.json({
    limit: "1mb",
    verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (
    err !== null &&
    typeof err === "object" &&
    "type" in err &&
    (err as { type: string }).type === "entity.too.large"
  ) {
    res.status(413).json({
      error: "Payload too large",
      code: "PAYLOAD_TOO_LARGE",
      message: "Request body exceeds the 1 MB limit",
    });
    return;
  }
  next(err);
});

const clerkProxyUrl = process.env["CLERK_PROXY_URL"];
const clerkProxyOrigin = clerkProxyUrl ? new URL(clerkProxyUrl).origin : undefined;

const authorizedParties = [
  process.env["FRONTEND_URL"],
  clerkProxyOrigin,
  process.env["REPLIT_DEV_DOMAIN"] ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` : undefined,
  ...replitDomains,
  ...additionalOrigins,
].filter(Boolean) as string[];

const clerkAuth = clerkMiddleware(authorizedParties.length > 0 ? { authorizedParties } : {});

const CLERK_BYPASS_PATHS = new Set([
  "/api/calendar/callback",
  "/api",
  "/api/health",
  "/api/healthz",
]);

app.use((req, res, next) => {
  if (CLERK_BYPASS_PATHS.has(req.path)) {
    return next();
  }
  return clerkAuth(req, res, next);
});

const rateLimitHandler = (_req: Request, res: Response) => {
  res.status(429).json({
    error: "TOO_MANY_REQUESTS",
    code: "TOO_MANY_REQUESTS",
    message: "Muitas requisições. Aguarde um momento e tente novamente.",
  });
};

function parseRateLimitEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(`⚠️  ${name} has invalid value "${raw}"; falling back to default ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

const RATE_LIMIT_WINDOW_MS = parseRateLimitEnv("RATE_LIMIT_WINDOW_MS", 60_000);
const RATE_LIMIT_PUBLIC_MAX = parseRateLimitEnv("RATE_LIMIT_PUBLIC_MAX", 60);
const RATE_LIMIT_ORDERS_MAX = parseRateLimitEnv("RATE_LIMIT_ORDERS_MAX", 5);

const publicGeneralLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_PUBLIC_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const publicOrderLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: RATE_LIMIT_ORDERS_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const referralValidateLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Separate instance from referralValidateLimiter so a legitimate landing-page
// /referral/info lookup does not consume the customer's /validate budget (and
// vice-versa). Bounds anonymous brute-forcing of referral codes via /info.
const referralInfoLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const priceAlertSubscribeLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const orderLookupLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: parseRateLimitEnv("RATE_LIMIT_ORDER_LOOKUP_MAX", 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Dedicated limiter for the referral visit-tracking write endpoint. It is more
// generous than /validate and /info (it fires per storefront page view) but
// still bounds anonymous write amplification against referral_tracking, which
// the shared publicGeneralLimiter alone does not isolate.
const referralTrackLimiter = rateLimit({
  windowMs: 60_000,
  max: parseRateLimitEnv("RATE_LIMIT_REFERRAL_TRACK_MAX", 30),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

app.use("/api/public", publicGeneralLimiter);
app.post("/api/public/store/:slug/orders", publicOrderLimiter);
app.get("/api/public/store/:slug/orders/:orderNumber", orderLookupLimiter);
app.post("/api/public/store/:slug/referral/validate", referralValidateLimiter);
app.post("/api/public/store/:slug/referral/track", referralTrackLimiter);
app.get("/api/public/store/:slug/referral/info", referralInfoLimiter);
app.post("/api/public/store/:slug/price-alerts", priceAlertSubscribeLimiter);

app.use("/api", router);

if (!isDev) {
  const frontendDist = path.join(process.cwd(), "artifacts/visitecrm/dist/public");
  app.use(express.static(frontendDist));
  app.get("/{*splat}", (req: Request, res: Response, next: express.NextFunction) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use(errorHandler);

export default app;
