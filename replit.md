# VisiteCRM

## Overview

VisiteCRM is a comprehensive SaaS CRM platform designed for Brazilian tourism agencies specializing in group excursions. Its primary purpose is to streamline operations for these agencies by offering multi-tenancy, robust role-based access, and extensive features for managing trips, seats, and reservations. The platform also includes financial tracking, a Kanban sales pipeline, communication tools, automation capabilities, loyalty programs, NPS (Net Promoter Score) measurement, and advanced analytics. VisiteCRM aims to be the leading operational backbone for Brazilian tourism agencies, enhancing efficiency, customer engagement, and business growth in a specialized market segment.

## User Preferences

I want iterative development. I prefer detailed explanations for complex features and architectural decisions. Ask before making major changes to the database schema or core architectural patterns. Do not make changes to files related to `artifacts/mockup-sandbox`.

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

## External Dependencies

- **Clerk**: For user authentication and authorization.
- **PostgreSQL**: Primary database.
- **Google Calendar API**: For event synchronization and management.
- **Replit DB**: For database hosting in the Replit environment.