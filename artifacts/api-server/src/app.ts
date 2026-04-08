import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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

const ALLOWED_ORIGINS = new Set(
  [
    process.env["FRONTEND_URL"],
    process.env["REPLIT_DEV_DOMAIN"] ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` : undefined,
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

if (!process.env["CLERK_PROXY_URL"]) {
  logger.warn("⚠️  CLERK_PROXY_URL is not set. Clerk proxy is disabled. Set it to enable auth proxy.");
}

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware(isAllowedOrigin));

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const clerkProxyUrl = process.env["CLERK_PROXY_URL"];
const clerkProxyOrigin = clerkProxyUrl ? new URL(clerkProxyUrl).origin : undefined;

const authorizedParties = [
  process.env["FRONTEND_URL"],
  clerkProxyOrigin,
  process.env["REPLIT_DEV_DOMAIN"] ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` : undefined,
].filter(Boolean) as string[];

app.use(clerkMiddleware(authorizedParties.length > 0 ? { authorizedParties } : {}));

app.use("/api", router);

export default app;
