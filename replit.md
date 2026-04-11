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
| `/reservations` | Reservas | Reservation management; 3-step wizard (trip/client/seats → payment → confirmation summary); seat map picker; PDF voucher download + print |
| `/financial` | Financeiro | Receivables, payables, expenses |
| `/communication` | Comunicação | Messages + templates |
| `/automations` | Automações | Rule-based automation triggers |
| `/marketing` | Marketing | Campaigns + NPS tracking |
| `/registrations` | Cadastros | Suppliers, Vehicles, Accommodations, Destinations |
| `/settings` | Configurações | User profile + team management |
| `/admin` | Super Admin | Dashboard with stats cards |
| `/admin/tenants` | Agências | Full tenant list with search/filter, create, suspend/activate actions |
| `/admin/tenants/:id` | Detalhe Agência | Info edit (CNPJ, address, city, state, zipCode, plan, whatsapp, phone), users tab, audit log tab, suspend/activate controls |
| `/admin/plans` | Planos | Full CRUD for SaaS plans (name, price, limits, features list) |
| `/admin/billing` | Faturamento | Invoice list with status badges, amount display, create/update/delete |
| `/admin/metrics` | Métricas SaaS | MRR/growth/churn KPIs + Recharts area chart (historical data), top tenants table |
| `/admin/users` | Usuários | All platform users across all tenants, role badges, search |
| `/admin/logs` | Logs de Auditoria | Global audit log feed with tenant/action/user filtering |
| `/admin/settings` | Configurações | Feature flags management (enable/disable per-flag) |

## Authentication & Onboarding Flow (Task 30)

- **Sign-in page** (`/sign-in`): Split-screen layout — left branded panel (blue gradient, benefits list, testimonial), right Clerk form.
- **Sign-up page** (`/sign-up`): Split-screen layout — left branded panel (green gradient, agency-only notice, stats), right Clerk form.
- **Onboarding** (`/onboarding`): Multi-step stepper for new agencies: Step 1 (Agency name, CNPJ, phone, slug with real-time uniqueness check), Step 2 (Plan selection with pricing). Creates tenant in DB via `POST /api/onboarding/agency`.
- **Role-based redirect** (`HomeRedirect`/`RoleRedirect`): After login, syncs user then redirects by role: `superadmin → /admin`, `agencia/vendedor → /dashboard` (or `/onboarding` if no tenant), `cliente → /loja/:slug`.
- **syncMe modified**: New Clerk users are created in DB WITHOUT auto-creating a tenant (they must go through onboarding).
- **Team management** (`/configuracoes` → Equipe tab): Lists team members, invite by email via `POST /api/team/invite`, deactivate via `DELETE /api/team/members/:id`.

## Key API Routes

All routes under `/api/`:
- `GET /api/onboarding/status` — check if user completed onboarding
- `POST /api/onboarding/agency` — create tenant + link user (first-time setup)
- `GET /api/onboarding/plans` — list active plans for onboarding selection
- `GET /api/onboarding/check-slug` — validate slug uniqueness
- `GET /api/team/members` — list team members for current tenant
- `POST /api/team/invite` — invite a new vendedor by email
- `DELETE /api/team/members/:id` — deactivate a team member
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
- `GET/POST/PUT/DELETE /api/plans` — SaaS plan CRUD (superadmin only)
- `GET/POST/PUT/DELETE /api/invoices` — invoice CRUD (superadmin only)
- `GET /api/admin/metrics` — SaaS KPIs (MRR, churn, growth, top tenants)
- `GET /api/admin/metrics/history` — historical MRR/churn over time
- `GET /api/admin/tenants/:id` — tenant detail with plan info
- `GET /api/admin/tenants/:id/users` — tenant user list
- `POST /api/tenants/:id/suspend` / `/activate` — tenant suspension
- `GET /api/admin/users` — all platform users
- `GET /api/admin/audit-logs` — global audit log feed
- `GET/PUT /api/admin/feature-flags` — feature flags management

## Multi-Tenant Online Store (Tasks #15–17)

### Admin Panel (authenticated, `/loja/*`)
| Route | Page |
|-------|------|
| `/loja/configuracoes` | Store settings + activation wizard (3-step) |
| `/loja/produtos` | Product CRUD (packages, products, services) |
| `/loja/categorias` | Category management with parent/child |
| `/loja/pedidos` | Order list + detail + status updates |
| `/loja/cupons` | Coupon CRUD (percentage / fixed) |
| `/loja/avaliacoes` | Review moderation + reply |

### Public Vitrine (unauthenticated, `/loja/:slug/*`)
| Route | Page |
|-------|------|
| `/loja/:slug` | Home — banner, featured products, categories |
| `/loja/:slug/catalogo` | Product catalog with search/filter/pagination |
| `/loja/:slug/produto/:productSlug` | Product detail + gallery + variants + reviews |
| `/loja/:slug/checkout` | Checkout form + coupon validation + order creation |
| `/loja/:slug/pedido/:orderNumber` | Order tracking page |

### Store API Routes
- `GET/PUT /api/store/settings` — store settings (admin)
- `POST /api/store/init` — create store (wizard)
- `GET/POST/PUT/DELETE /api/store/categories` — category CRUD
- `GET/POST/PUT/DELETE /api/store/products` — product CRUD
- `GET/GET/PUT /api/store/orders` — order management
- `GET/POST/PUT/DELETE /api/store/coupons` — coupon CRUD
- `GET/PUT /api/store/reviews/:id/status` — review moderation
- `GET /api/public/store/:slug` — public store info
- `GET /api/public/store/:slug/categories` — public categories
- `GET /api/public/store/:slug/products` — public products (search/filter/paginate)
- `GET /api/public/store/:slug/products/:slug` — public product detail + reviews
- `POST /api/public/store/:slug/orders` — create order (with coupon auto-apply)
- `GET /api/public/store/:slug/orders/:orderNumber` — track order
- `POST /api/public/store/:slug/coupons/validate` — coupon validation
- `POST /api/public/store/:slug/reviews` — submit review (goes to moderation)

### Frontend Architecture
- `lib/storeApi.ts` — typed fetch client for store API (admin + public)
- `contexts/CartContext.tsx` — cart state + drawer open/close
- `pages/vitrine/` — public storefront components (no Clerk auth)
- `pages/loja/` — admin store management pages

## Database Schema (Drizzle)

Schema in `lib/db/src/schema/`: tenants, users, clients, trips, reservations, passengers, seats, payments, expenses, pipeline_stages, deals, messages, message_templates, automations, suppliers, vehicles, accommodations, destinations, campaigns, nps_responses, loyalty_points, referrals, plans, invoices, feature_flags.

Store tables: **stores**, **store_categories**, **store_products**, **store_orders**, **store_coupons**, **store_reviews** (all using text IDs via `generateId()`).

The `tenants` table was extended via raw SQL with: `cnpj`, `address`, `city`, `state`, `zip_code` columns.

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
