---
name: Clerk dev proxy (frontend must match backend)
description: Why the Vite frontend must route Clerk FAPI through the same-origin /api/__clerk proxy in the Replit dev iframe, and the https-only guard.
---

# Clerk dev auth in the Replit preview iframe

The Replit workspace preview is a **cross-site HTTPS iframe**. Clerk's direct FAPI
cookies are third-party there and get blocked, so the API sees no session and
returns 401 on every `/api/*` request. That 401 makes `RoleRedirect` (App.tsx)
bounce a signed-in user to `/sign-in`, which Clerk bounces back to `/` → an
infinite redirect loop ("The <SignIn/> component cannot render when a user is
already signed in" repeating in the console).

**Rule:** the backend and frontend Clerk-proxy config must be symmetric in dev.
The backend (`app.ts`) derives `CLERK_PROXY_URL=https://${REPLIT_DEV_DOMAIN}/api/__clerk`
and mounts `clerkProxyMiddleware` at `/api/__clerk`. The frontend
(`App.tsx` `clerkProxyUrl` → `<ClerkProvider proxyUrl>`) MUST also point at that
same-origin proxy in dev so Clerk's cookies become first-party. If only the
backend enables the proxy, auth still breaks.

**Why the `window.location.protocol === "https:"` guard:** Clerk always loads its
`clerk-js` script over **HTTPS**. If `proxyUrl` is derived from a plain
`http://localhost:5000` origin, Clerk upgrades the script URL to
`https://localhost:5000/...` which fails with `failed_to_load_clerk_js`
(ERR_SSL_PROTOCOL_ERROR). So derive the proxy only when the current origin is
already https (the real user's preview = `https://<REPLIT_DEV_DOMAIN>`); on
http://localhost (the agent's `app_preview` screenshots) fall back to Clerk's
direct FAPI.

**Production:** `import.meta.env.DEV` is false there, so no proxy is derived. A
proxy is only used in prod if `VITE_CLERK_PROXY_URL` is explicitly set. Do NOT set
it to a domain you don't actually serve the `/api/__clerk` proxy from (a stale
`visitecrm.com` value once caused a blank page in prod). For a `.replit.app`
deploy (top-level context, not an iframe), direct FAPI works without a proxy.

**Prod env vars that matter for auth/CORS:** `FRONTEND_URL` (and optionally
`ADDITIONAL_ORIGINS`) must include the deployed origin, or same-origin POSTs are
rejected by the CORS middleware and Clerk `authorizedParties` won't match.
