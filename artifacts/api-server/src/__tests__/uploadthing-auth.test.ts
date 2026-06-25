/**
 * Regression tests for the UploadThing route's Clerk middleware bypass.
 *
 * Tasks #577 and #579 introduced and fixed two consecutive bugs caused by
 * interactions between Clerk middleware and the UploadThing SDK that only
 * appeared in production. These tests guard against future regressions in
 * three scenarios:
 *
 *   1. POST /api/uploadthing?actionType=callback  — Clerk BYPASSED (CDN callback)
 *   2. POST /api/uploadthing?actionType=upload     — Clerk RUNS, no session → 401
 *   3. POST /api/uploadthing?actionType=upload     — Clerk RUNS, valid session → 200
 *
 * The test replicates the exact bypass middleware from app.ts around a stub
 * UploadThing handler, so the critical path is exercised without needing a
 * live UploadThing connection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted state — accessible inside vi.mock() factories ─────────────────────

const { clerkCallCount, mockAuthState } = vi.hoisted(() => ({
  // Tracks how many times the Clerk middleware was invoked per test.
  clerkCallCount: { value: 0 },
  // Controls what getAuth() returns — set per test to simulate auth state.
  mockAuthState: { userId: null as string | null },
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@clerk/express", () => ({
  clerkMiddleware:
    () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
      clerkCallCount.value++;
      next();
    },
  getAuth: (_req: unknown) => ({ userId: mockAuthState.userId }),
}));

vi.mock("uploadthing/express", () => ({
  // Minimal chain so uploadthing.ts evaluates cleanly.
  createUploadthing: () => (_config: unknown) => ({
    middleware: (_fn: unknown) => ({
      onUploadComplete: (_fn: unknown) => ({}),
    }),
  }),
  // Stub route handler that replicates the auth semantics of the real handler:
  //   - actionType=callback → no Clerk session needed (CDN posts without one;
  //     UploadThing verifies via its own x-uploadthing-signature header)
  //   - all other paths    → require a Clerk userId (the real .middleware() throws
  //     "Unauthorized" when getAuth(req).userId is null, which UploadThing converts
  //     to a 401 response)
  createRouteHandler:
    (_opts: unknown) =>
    (req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (req.query["actionType"] === "callback") {
        res.status(200).json({ ok: true });
        return;
      }
      if (!mockAuthState.userId) {
        res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
        return;
      }
      res.status(200).json({ ok: true });
    },
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

// ── Imports (after mocks — vi.mock is hoisted, so these see mocked modules) ───

import { clerkMiddleware } from "@clerk/express";
import { uploadthingRouter } from "../routes/uploadthing.js";

// ── Minimal app — exact replica of the bypass middleware from app.ts ───────────

// Paths that skip Clerk entirely (same set as app.ts).
const CLERK_BYPASS_PATHS = new Set([
  "/api",
  "/api/health",
  "/api/healthz",
  "/api/health/auth",
]);

function buildApp(): express.Express {
  const app = express();
  const clerkAuth = clerkMiddleware();

  // This is the middleware under test — copied verbatim from app.ts.
  // /api/uploadthing?actionType=callback must bypass Clerk so the UploadThing CDN
  // can post completion callbacks without a user session.
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path === "/api/uploadthing" && req.query["actionType"] === "callback") {
      return next();
    }
    if (CLERK_BYPASS_PATHS.has(req.path)) {
      return next();
    }
    return clerkAuth(req, res, next);
  });

  app.use("/api/uploadthing", uploadthingRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/uploadthing — Clerk middleware bypass for CDN callbacks", () => {
  let app: express.Express;

  beforeEach(() => {
    clerkCallCount.value = 0;
    mockAuthState.userId = null;
    app = buildApp();
  });

  it("actionType=callback: Clerk is NOT invoked, handler responds 200 without a session", async () => {
    // No session — Clerk would reject if it ran.
    mockAuthState.userId = null;

    const res = await request(app)
      .post("/api/uploadthing?actionType=callback")
      .send({});

    // Core regression guard: Clerk must have been bypassed entirely.
    expect(clerkCallCount.value).toBe(0);
    // Handler was reached and accepted the sessionless CDN request.
    expect(res.status).toBe(200);
  });

  it("actionType=upload without a session: Clerk runs and handler returns 401", async () => {
    mockAuthState.userId = null; // unauthenticated

    const res = await request(app)
      .post("/api/uploadthing?actionType=upload")
      .send({});

    // Clerk DID run — the upload path is not bypassed.
    expect(clerkCallCount.value).toBe(1);
    // Handler enforced the userId check → 401.
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("actionType=upload with a valid session: Clerk runs and handler returns 200", async () => {
    mockAuthState.userId = "user_test_abc"; // authenticated

    const res = await request(app)
      .post("/api/uploadthing?actionType=upload")
      .send({});

    // Clerk DID run.
    expect(clerkCallCount.value).toBe(1);
    // Handler accepted the authenticated request.
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("no actionType query param: Clerk runs (bypass requires actionType=callback)", async () => {
    mockAuthState.userId = null;

    const res = await request(app)
      .post("/api/uploadthing")
      .send({});

    // No actionType=callback → Clerk must have run.
    expect(clerkCallCount.value).toBe(1);
    // No session → 401.
    expect(res.status).toBe(401);
  });

  it("actionType=serverCallback: Clerk runs (only 'callback' is in the bypass condition)", async () => {
    // Ensures the bypass is not accidentally broadened to other UploadThing action types.
    mockAuthState.userId = null;

    await request(app)
      .post("/api/uploadthing?actionType=serverCallback")
      .send({});

    expect(clerkCallCount.value).toBe(1);
  });
});
