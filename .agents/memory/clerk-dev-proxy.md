---
name: Clerk dev proxy — removed, do not re-add
description: History of the Clerk proxy approach and why it was removed. Clerk now works without a proxy in both dev and prod.
---

# Clerk proxy — removed

## Why the proxy was removed

Clerk **requires every `proxyUrl` to be registered in the Clerk Dashboard** under
your instance's domains. The Replit preview URL changes per session
(`fcd588d6-...spock.replit.dev`), so it can never be registered — Clerk always
returned `400 / "unable to attribute this request to an instance"` and the app
showed a blank page.

**Do not re-add auto-derived proxy URLs.** The pattern
`window.location.origin + "/api/__clerk"` (or deriving from `REPLIT_DEV_DOMAIN`)
is broken by design for ephemeral preview URLs.

## Current setup (no proxy)

- **Frontend** (`App.tsx`): `clerkProxyUrl` is `undefined` unless
  `VITE_CLERK_PROXY_URL` is explicitly set. Auto-derivation is gone.
- **Backend** (`app.ts`): `CLERK_PROXY_URL` is never auto-set. The
  `clerkProxyMiddleware` is still mounted at `/api/__clerk` but silently passes
  through when `CLERK_PROXY_URL` is unset (no warning logged).
- **Clerk v6** handles cross-site iframe auth via localStorage-based session
  tokens — no proxy needed for the Replit preview pane.

## If a proxy is ever genuinely needed

Only enable it when you have a **stable, registered domain** (e.g. a custom
production domain). Steps:
1. Register the proxy URL in Clerk Dashboard → Domains.
2. Set `VITE_CLERK_PROXY_URL=https://yourdomain.com/api/__clerk` in the env.
3. Set `CLERK_PROXY_URL=https://yourdomain.com/api/__clerk` on the backend.

The proxy middleware in `clerkProxyMiddleware.ts` is already in place and
activates automatically when `CLERK_PROXY_URL` is set.

## Prod env vars that matter for auth/CORS

`FRONTEND_URL` (and optionally `ADDITIONAL_ORIGINS`) must include the deployed
origin, or CORS middleware rejects cross-origin POSTs and Clerk
`authorizedParties` won't match.
