---
name: UploadThing SDK v7 CDN upload bug
description: Effect-Platform HTTP client in UTApi v7.x breaks CDN PUT requests in production with double-encoded params and spurious Range header. Version pinned to 7.7.4 (exact, no ^).
---

## Rule
Patch via `undici.setGlobalDispatcher` + `agent.compose()` interceptor in `artifacts/api-server/src/lib/uploadthing.ts` before creating the UTApi instance. The interceptor targets PUT requests to `*.ingest.uploadthing.com` and fixes two bugs from the Effect-Platform HTTP client.

Version is pinned to `"uploadthing": "7.7.4"` (exact, no `^`) in `artifacts/api-server/package.json` — do NOT add the caret back until the upstream fix is confirmed.

**Bug 1 — Spurious `Range: bytes=0-` header**
Effect-Platform adds this header to all PUT requests. UploadThing's CDN HMAC verifies the exact set of signed headers; any extra header breaks the signature check.

**Bug 2 — Double-encoded query parameters**
Effect-Platform percent-encodes already-encoded sequences in the presigned URL:
- `image%2Fpng` → `image%252Fpng`
- `Visite%20Cariri` → `Visite%2520Cariri`

The CDN decodes once, receiving `image%2Fpng` instead of `image/png`. Since the HMAC was computed over the decoded value `image/png`, the check fails with "Failed to verify URL: Invalid signature".

**Fix** (in `opts.path` inside the undici interceptor):
```typescript
opts["path"] = opts["path"].replace(/%25([0-9A-Fa-f]{2})/g, "%$1");
```

**Why undici compose, NOT globalThis.fetch:**
Effect-Platform's `HttpClient` uses `undici` directly — it does NOT go through `globalThis.fetch`. Patching `globalThis.fetch` has zero effect on Effect Platform's outgoing requests, confirmed by production logs still showing double-encoded URLs even with the fetch patch in place.

`undici.setGlobalDispatcher(agent.compose(interceptor))` intercepts ALL undici traffic at the dispatch level, before bytes hit the wire — including Effect Platform's requests.

**How to apply:**
Keep `patchUndiciForUploadThingCDN()` in `uploadthing.ts`. The function uses a dynamic `require("undici")` to avoid TypeScript module-resolution issues with multiple undici versions in the monorepo. Do not remove it or bump the version pin until the Effect-Platform CDN PUT behavior is confirmed fixed upstream. Latest checked: `7.7.4` is the current latest (no fix released yet as of June 2026).
