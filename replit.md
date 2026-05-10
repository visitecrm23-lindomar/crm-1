# VisiteCRM

## Overview

VisiteCRM is a comprehensive SaaS CRM platform designed for Brazilian tourism agencies specializing in group excursions. Its primary purpose is to streamline operations for these agencies by offering multi-tenancy, robust role-based access, and extensive features for managing trips, seats, and reservations. The platform also includes financial tracking, a Kanban sales pipeline, communication tools, automation capabilities, loyalty programs, a referral system, NPS (Net Promoter Score) measurement, and advanced analytics. VisiteCRM aims to be the leading operational backbone for Brazilian tourism agencies, enhancing efficiency, customer engagement, and business growth in a specialized market segment.

## User Preferences

I want iterative development. I prefer planned reporting for complex features and architectural decisions. Consult before making major changes to the database schema or core architectural patterns. Do not make changes to files related to `artifacts/mockup-sandbox`.

## System Architecture

VisiteCRM is built as a pnpm workspace monorepo utilizing TypeScript.

### Stack
- **Monorepo Tool**: pnpm workspaces
- **Node.js**: 24
- **Package Manager**: pnpm
- **Frontend**: React 19, Vite, Tailwind CSS v4, shadcn/ui
- **Authentication**: Clerk (`@clerk/react`, `@clerk/express`)
- **API Framework**: Express 5
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build Tools**: esbuild (API), Vite (frontend)

### Artifacts
- **`artifacts/visitecrm`**: React frontend, port 19951, accessible at `/`
- **`artifacts/api-server`**: Express API server, port 8080, routes at `/api`

### Core Features and Design Patterns
- **Multi-tenancy**: Each agency operates as a distinct tenant with isolated data.
- **Role-Based Access Control (RBAC)**: Supports roles like `superadmin`, `agencia`, `vendedor`, and `cliente` with fine-grained permissions enforced at the API level.
- **UI/UX**: Frontend uses React with Tailwind CSS and shadcn/ui for a modern, responsive design. All user-facing content is in Brazilian Portuguese.
- **Authentication & Onboarding**: Integrates Clerk for authentication. New agencies go through a multi-step onboarding process to create their tenant. Users are synced to the database upon login.
- **Key Modules**:
    - **Dashboard**: Provides KPIs, charts, and conversion funnels.
    - **Pipeline**: Kanban drag-and-drop sales pipeline.
    - **Trip & Reservation Management**: Comprehensive CRUD operations for trips, seat mapping, and passenger management with PDF exports.
    - **Financials**: Manages receivables, payables, and expenses.
    - **Communication & Automation**: Messaging, templates, and rule-based automation triggers.
    - **Marketing**: Campaigns and NPS tracking.
    - **Registrations**: Management of suppliers, vehicles, accommodations, and destinations.
    - **Admin Panel**: Superadmin features for tenant, plan, billing, and user management, along with SaaS metrics.
- **Database Schema**: Drizzle ORM manages a PostgreSQL database. Uses text IDs generated with `generateId()` for all tables instead of serial integers.
- **API Design**: All API routes are prefixed with `/api/` and follow RESTful principles.
- **Reservation Numbering**: A structured, human-readable reservation numbering system (`{PREFIX}-{TYPE}-{YYYYMM}-{NNNNN}`) is implemented for clarity and traceability.
- **Google Calendar Integration**: Features an OAuth flow for connecting Google Calendar, with auto-sync hooks for trip events, payments, and birthdays. Supports automatic token refresh.

### Multi-Tenant Online Store
The platform includes a multi-tenant e-commerce solution with both an admin panel for agencies and a public storefront.
- **Admin Panel (`/loja/*`)**: For store settings, product/category/coupon CRUD, order management, and review moderation.
- **Public Vitrine (`/loja/:slug/*`)**: An unauthenticated storefront for customers to browse products, view details, checkout, and track orders.

### Async Job Queue (BullMQ)
- **Package**: `bullmq` v5 + `ioredis` in `@workspace/api-server`
- **Connection**: `src/lib/redis.ts` — reads `REDIS_URL` env var; gracefully disabled when absent (falls back to synchronous email).
- **Queue definitions**: `src/queues/index.ts` — `emails` queue (3 retries, exponential backoff) and `reminders` queue.
- **Workers** (started in `src/index.ts` on server boot if Redis is available):
  - `src/workers/email.worker.ts` — processes `reservation-confirmation` jobs, updates `email_logs` status.
  - `src/workers/reminder.worker.ts` — processes `boarding_reminder` (D-1) and `payment_reminder` (D-3) daily jobs.
- **Repeatable jobs**: registered via `Queue.upsertJobScheduler` at 08:00 BRT daily (configurable via `REMINDER_CRON` + `REMINDER_TZ` env vars).
- **Email helper**: `src/queues/email-helpers.ts` — `enqueueReservationConfirmationEmail` transparently queues or sends directly. If `queue.add()` itself fails (e.g. Redis unhealthy), the `email_logs` row is set to `failed` immediately — there is no sync fallback when `REDIS_URL` is configured.
- **Resend endpoint**: `POST /api/email-logs/:id/resend` — creates a new `email_logs` row per resend attempt and enqueues a fresh delivery job. Restricted to `MANAGEMENT_ROLES`. Only logs with `status=failed` can be resent (422 otherwise).
- **Reminder retry semantics**: Reminder workers iterate all eligible recipients in one batch job. Individual send failures are logged per recipient but the job does not throw, so BullMQ does not retry the whole batch (which would risk double-sending to recipients already reached). This is an intentional reliability tradeoff. See `src/workers/reminder.worker.ts` for details.

### Real-Time Seat Availability (SSE)
- **Module**: `artifacts/api-server/src/lib/seat-sse.ts` — in-memory registry of `tripId → Set<Response>`, exports `addSeatClient`, `removeSeatClient`, `emitSeatUpdate`.
- **Public SSE endpoint**: `GET /api/public/store/:slug/trips/:tripId/seats/stream` — no auth, for Vitrine wizard customers. Validates store exists before upgrading to SSE.
- **Admin SSE endpoint**: `GET /api/trips/:tripId/seats/stream` — requires Clerk auth, for admin seat map views.
- **Emit triggers**: `broadcastSeatUpdate(tripId, tenantId)` is called (fire-and-forget) after any seat-changing operation:
  - `POST /api/reservations` (admin reservation creation)
  - `PATCH /api/reservations/:id` (any status/seat change, including cancellation)
  - `DELETE /api/reservations/:id`
  - `POST /api/public/store/:slug/orders` (Vitrine checkout, for all trip-linked products)
- **Frontend hook**: `artifacts/visitecrm/src/hooks/useSeatStream.ts` — `useSeatStream({ tripId, slug, isPublic, enabled })` returns `{ occupiedSeats: Record<string, string>, connected: boolean }`.
- **Wizard integration**: `reservation-wizard.tsx` uses `useSeatStream` on step `"assento"`. SSE updates patch `liveLayoutSeatMap.seats` for the `PublicLayoutSeatPicker` and drive `occupiedSeats` for the fallback `SeatGrid`. Automatically deselects any seat that becomes occupied via SSE.
- **Keep-alive**: 30-second comment pings (`": ping\n\n"`) prevent proxy timeouts.
- **Cleanup**: `req.on("close", ...)` removes clients and clears intervals.
- **Scope limitation**: Single-instance only (no Redis pub/sub). Multi-instance support is out of scope.

## Testing Infrastructure

- **Test framework**: Vitest v3 (added to pnpm catalog as `vitest: ^3.1.0`)
- **Run all tests**: `pnpm test` from the workspace root (runs backend then frontend)
- **Run backend only**: `pnpm --filter @workspace/api-server run test`
- **Run frontend only**: `pnpm --filter @workspace/visitecrm run test`

### Backend tests (`artifacts/api-server`) — 77 tests total
- Config: `vitest.config.ts` — `environment: "node"`, includes `src/**/*.test.ts`
- `src/__tests__/errors.test.ts` — 15 tests covering all typed error classes (`AppError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `ValidationError`)
- `src/__tests__/lib.test.ts` — 22 tests covering pure utility functions:
  - `tripTypeToCode`, `derivePrefix`, `getYearMonth`, `buildReservationNumber` from `lib/reservation-number.ts`
  - `deriveAgeCategory`, `getAgeYears` from `lib/passenger.ts`
  - DB and drizzle-orm imports are mocked via `vi.mock`
- `src/__tests__/broadcastSeatUpdate.test.ts` — 5 tests verifying seat broadcast logic (confirmed/pending/merged maps), mocks db chain via `vi.hoisted`
- `src/__tests__/reservation-calculations.test.ts` — 18 tests covering:
  - `applyDiscounts(base, coupon, loyalty, referral)` — multi-discount priority: coupon → loyalty → referral with sequential balance reduction; capping; zero-discount path
  - `computeBalance(totalValue, paidValue)` — partial payment, full payment, non-negative clamp
  - `normalizeOrderEmail(raw)` — valid string, undefined, empty, whitespace, non-string types
  All three functions imported directly from `src/lib/pricing.ts`.
- `src/__tests__/endpoints.test.ts` — 12 endpoint-level tests via supertest (real route handlers, mocked DB/Clerk/queues):
  - `POST /api/reservations`: required-field validation (400), client-not-found (400), partial-payment balance computation, fully-paid (balance=0), overpaid (balance clamped to 0), response body shape
  - `GET /api/public/store/:slug/orders/:orderNumber`: absent/empty/whitespace email → 400 VALIDATION_ERROR, valid email with order-not-found → 404, store-not-found → 404, case-insensitive email normalization
- `src/workers/reminder.worker.test.ts` — 17 tests (12 original + 5 for `notifyStaffOfExhaustedRetries`):
  - Staff alert sent to store + admin recipients on exhaustion
  - Dedup: second staff alert not sent if one already succeeded
  - No-recipients guard (skips, logs warn)
  - Missing reservation details guard (skips, logs warn)

### Frontend tests (`artifacts/visitecrm`) — 51 tests total
- Config: `vitest.config.ts` — `environment: "jsdom"`, `@` alias resolved to `src/`, includes `src/**/*.test.ts`
- `src/__tests__/utils.test.ts` — 26 tests covering pure utility functions:
  - `formatCurrency`, `formatDate`, `getCountdownLabel`, `escapeHtml`, `formatCpf`, `generateProductSlug` from `pages/trips/utils.ts`
  - External workspace deps are mocked via `vi.mock`
- `src/__tests__/reservation.test.ts` — 25 tests covering:
  - `computeReservationTotal(priceAdult, seats)` — adult price × seat count (0 seats, 1 seat, N seats, fractional price, zero price)
  - `computeDetailedTotal({ priceAdult, adultSeats, priceChild, childSeats, priceSenior, seniorSeats })` — adult-only, adult+child, adult+senior, null child price falls back to adult price, all-empty
  - `applyDiscount(totalValue, discountAmount)` — zero discount, full discount, excess discount clamped to 0, partial discount
  - `CreateReservationBody` Zod schema validation (required fields, type errors, optional fields)
  - `CreateTripBody` Zod schema validation (required fields, type errors, optional pricing fields)
  All pricing functions imported directly from `src/lib/reservationPricing.ts`.

## Database Migrations & Seeding

### Migrations
Drizzle ORM manages all schema migrations in `lib/db/drizzle/` (files `0000`–`0010`).  
Migrations run automatically on API server startup via `runMigrations()` in `lib/db/src/migrate.ts`.  
Migration `0000` uses `CREATE TABLE IF NOT EXISTS` and `DO $$ IF NOT EXISTS $$` guards on all FK constraints, making it safe to run against both fresh and existing databases.

**Important**: Never mutate already-applied historical migrations (`0000`–`0009`). Add schema changes as new numbered migration files.

### Plan Seeding
Plan rows (Starter, Pro, Enterprise) are **not** seeded automatically on startup. After running migrations on a fresh database, seed plans manually:

```bash
pnpm --filter @workspace/scripts run seed:plans
```

This is required for the billing system, plan selection UI, and tenant onboarding to function correctly. See `scripts/src/seed-plans.ts`.

## External Dependencies

- **Clerk**: For user authentication and authorization.
- **PostgreSQL**: Primary database.
- **Google Calendar API**: For event synchronization and management.
- **Replit DB**: For database hosting in the Replit environment.
- **Redis (optional)**: Required for BullMQ async job queues. Set `REDIS_URL` env var (Upstash-compatible). When absent, emails are sent synchronously. **Note**: The Upstash free tier has a 500 000 daily request limit. BullMQ's keep-alive polling can exhaust this quickly in active development. Upgrade to a paid Upstash tier or run a local Redis instance (`redis-server`) for sustained dev usage.

### BullMQ Worker Tuning (Redis request reduction)

All five workers (`email`, `reminder`, `pdf`, `commission-sync`, `whatsapp`) are initialised with environment-aware options controlled by a `NODE_ENV !== "production"` guard:

| Setting | Development | Production |
|---|---|---|
| `concurrency` | 1 | 1–5 (per worker original value) |
| `stalledInterval` | 60 000 ms (1 min) | 15 000 ms (15 s) |
| `drainDelay` | 30 s | 5 s (BullMQ default) |

In **development**, `drainDelay: 30` (seconds) makes each worker pause 30 seconds before re-polling Redis when the queue is empty, dramatically reducing idle request traffic against Upstash's free-tier budget. `stalledInterval: 60_000` (ms) reduces the frequency of stall-detection checks.

In **production**, `stalledInterval: 15_000` (ms) provides fast stall detection (15 s) and `drainDelay` is left at the BullMQ default (5 s) for maximum responsiveness.