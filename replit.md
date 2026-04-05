# VisiteCRM

## Overview

VisiteCRM is a comprehensive SaaS CRM platform for Brazilian tourism agencies specializing in group excursions. It features multi-tenancy, role-based access, trip/seat management, reservations, financial tracking, Kanban pipeline, communication, automations, loyalty programs, NPS, and analytics.

## Architecture

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

### Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Frontend**: React 19 + Vite + Tailwind CSS v4 + shadcn/ui
- **Auth**: Clerk (`@clerk/react`, `@clerk/express`)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (API) + Vite (frontend)

## Artifacts

- **`artifacts/visitecrm`** — React frontend, port 19951, preview at `/`
- **`artifacts/api-server`** — Express API server, port 8080, routes at `/api`
- **`artifacts/mockup-sandbox`** — Vite component preview server, port 8081

## Key Pages (all in Brazilian Portuguese)

| Route | Page | Features |
|-------|------|----------|
| `/` | Landing | Marketing page with sign in/up |
| `/dashboard` | Dashboard | Stats cards + upcoming trips |
| `/pipeline` | Pipeline | Kanban drag-and-drop sales pipeline |
| `/clients` | Clientes | Client list with search + create |
| `/trips` | Viagens | Trip list with stat cards, card grid, search/status filters, grid/list view toggle |
| `/trips/new` | Nova Viagem | 8-tab trip creation form (Básicas, Preços, Pontos de Embarque, Roteiro, Inclusões/Exclusões, Custos, Transporte e Hospedagem, Mídia) with Tiptap rich text editor for description |
| `/trips/:id/edit` | Editar Viagem | Same 8-tab form pre-populated for editing |
| `/trips/:id/seat-map` | Mapa de Assentos | Visual 2x2/2x1 bus seat layout, color-coded by status, trip selector dropdown, client search + manual mode assignment modal |
| `/trips/:id/passengers-overview` | Visão Geral | Trip selector, 6 KPI cards, status breakdown bars, payment method bars, sortable reservations table, client origin chart, guide/vehicle info, full quick-actions (Add, Export PDF, WhatsApp, Financial Report, Close Trip) |
| `/trips/:id/passengers` | Lista ANTT | Full passenger table with search, status/payment/type/boarding-point filters, select-all/bulk check-in/vouchers/WhatsApp, CSV/PDF/Excel export |
| `/trips/calendar` | Calendário | Month/week/day views with trip events, color by status, click-to-detail modal |
| `/reservations` | Reservas | Reservation management + vouchers |
| `/financial` | Financeiro | Receivables, payables, expenses |
| `/communication` | Comunicação | Messages + templates |
| `/automations` | Automações | Rule-based automation triggers |
| `/marketing` | Marketing | Campaigns + NPS tracking |
| `/registrations` | Cadastros | Suppliers, Vehicles, Accommodations, Destinations |
| `/settings` | Configurações | User profile + team management |

## Key API Routes

All routes under `/api/`:
- `GET/POST /api/dashboard/*` — dashboard stats
- `GET/POST/PUT /api/clients` — client CRUD
- `GET/POST/PUT /api/trips` — trip CRUD
- `GET/POST/PUT /api/reservations` — reservation CRUD
- `GET/POST/PUT /api/payments` — payment/financial CRUD
- `GET/POST/PUT /api/pipeline/stages`, `/api/deals` — Kanban pipeline
- `GET/POST /api/messages`, `/api/message-templates` — communication
- `GET/POST/PUT /api/automations` — automations
- `GET/POST /api/campaigns` — marketing campaigns
- `GET/POST /api/nps-responses`, `/api/nps/summary` — NPS
- `GET/POST /api/suppliers`, `/api/vehicles`, `/api/accommodations`, `/api/destinations` — registrations
- `POST /api/users/me/sync` — sync Clerk user to DB
- `GET /api/users/me` — get current user profile

## Database Schema (Drizzle)

Schema in `lib/db/src/schema/`: tenants, users, clients, trips, reservations, passengers, seats, payments, expenses, pipeline_stages, deals, messages, message_templates, automations, suppliers, vehicles, accommodations, destinations, campaigns, nps_responses, loyalty_points, referrals.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Multi-tenancy & Roles

- Roles: `superadmin`, `agencia`, `vendedor`, `cliente`
- Each agency has one tenant; pipeline stages are auto-created on first load
- Users are created/synced on sign-in via `POST /api/users/me/sync`

## RBAC Authorization

Role enforcement uses the inline pattern throughout API routes:
```ts
const ADMIN_ROLES = ["agencia", "superadmin"];
if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
```
Mutations in `marketing.ts`, `registrations.ts`, and `communication.ts` are guarded. As new modules are added, apply the same pattern consistently.

## Deployment Environment Variables

Required for full functionality:
- `CLERK_SECRET_KEY` — Clerk backend secret
- `CLERK_PUBLISHABLE_KEY` — Clerk frontend key (in visitecrm)
- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit DB)
- `REPLIT_DEV_DOMAIN` — auto-set in Replit dev, used for CORS allowlist

Optional:
- `FRONTEND_URL` — explicit frontend origin for CORS (useful in custom/production deployments)

If neither `FRONTEND_URL` nor `REPLIT_DEV_DOMAIN` is set at startup, the API server logs a CORS warning — browser cross-origin calls will be blocked (same-origin requests still work).

## Important Notes

- API build uses esbuild (not tsc) — `tsc --noEmit` errors can be ignored
- DB schema uses text IDs via `generateId()` (randomBytes base64url), NOT serial integers
- All numeric DB columns use `String()` on insert (Drizzle numeric type), `Number()` on read
- Pipeline stages are created via `ensureDefaultPipeline()` on first `/api/pipeline/stages` request
- `SyncMeBody` requires `clerkId`, `name`, `email` fields (passed from Clerk user object)
- After codegen (`pnpm --filter @workspace/api-spec run codegen`), fix `lib/api-zod/src/index.ts` to only export `./generated/api` (codegen adds a second line that causes conflicts)
