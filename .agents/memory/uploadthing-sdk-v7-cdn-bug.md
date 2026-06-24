---
name: UploadThing SDK v7 CDN upload bug
description: Effect-Platform HTTP client in UTApi v7.x breaks CDN PUT requests in production with double-encoded params and spurious Range header. Version pinned to 7.7.4 (exact, no ^).
---

## Rule
Patch `globalThis.fetch` in `artifacts/api-server/src/lib/uploadthing.ts` before creating the UTApi instance. The patch targets PUT requests to `*.ingest.uploadthing.com` and fixes two bugs introduced by the Effect-Platform HTTP client used internally by UTApi v7.x.

Version is pinned to `"uploadthing": "7.7.4"` (exact, no `^`) in `artifacts/api-server/package.json` — do NOT add the caret back until the upstream fix is confirmed.

**Bug 1 — Spurious `Range: bytes=0-` header**
Effect-Platform adds this header to all PUT requests. UploadThing's CDN HMAC verifies the exact set of signed headers; any extra header breaks the signature check.

**Bug 2 — Double-encoded query parameters**
Effect-Platform percent-encodes already-encoded sequences in the presigned URL:
- `image%2Fpng` → `image%252Fpng`
- `Visite%20Cariri` → `Visite%2520Cariri`

The CDN decodes once, receiving `image%2Fpng` instead of `image/png`. Since the HMAC was computed over the decoded value `image/png`, the check fails with "Failed to verify URL: Invalid signature".

**Fix** (single regex restores one layer of encoding):
```typescript
const fixedUrl = urlStr.replace(/%25([0-9A-Fa-f]{2})/g, "%$1");
```

**Why:**
Confirmed from production logs showing double-encoded params and `range: bytes=0-` in the PUT headers. Happens in the Replit production environment (Node.js native fetch path differs from dev).

**How to apply:**
Keep `patchFetchForUploadThingCDN()` in `uploadthing.ts`. Do not remove it or bump the version pin until the Effect-Platform CDN PUT behavior is confirmed fixed upstream. Latest checked: `7.7.4` is the current latest (no fix released yet as of June 2026).
