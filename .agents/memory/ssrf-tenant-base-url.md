---
name: SSRF for tenant-supplied provider base URLs
description: How to safely make server-side HTTP calls to URLs that a tenant admin controls (e.g. per-tenant AI provider base URL)
---

When a tenant admin can configure a base URL that the server then calls (per-tenant
AI provider config, webhooks, etc.), a plain pre-flight DNS check is NOT enough.

The rule: validate up front AND enforce at connection time.

**Why:** A pre-flight `dns.lookup` that passes, followed by `fetch`, leaves a
DNS-rebinding / TOCTOU window — the hostname can resolve to a public IP during
validation and to a private/metadata IP (e.g. 169.254.169.254) during the actual
socket connect. The pre-check alone is bypassable.

**How to apply (in `artifacts/api-server/src/lib/ai-client.ts`):**
- `assertSafeUrl`: require HTTPS, reject literal private/reserved IPs, do an
  initial resolve check, and force `redirect: "error"` on the fetch.
- Connection-time guard: build an undici `Agent` with `connect.lookup` that
  re-resolves and rejects private/reserved addresses, binding the check to the
  real socket. undici skips `lookup` for literal IPs, so `assertSafeUrl` is what
  catches those.
- Use undici's OWN `fetch` (`import { fetch } from "undici"`), NOT Node's global
  fetch. Node 24's built-in undici is a different instance and rejects an
  external dispatcher with "invalid onRequestStart method". Pass the Agent as
  `dispatcher` to undici's fetch, then hand that fetch to the OpenAI SDK's
  `fetch` option.
- Sanitize provider/network errors before returning/logging them — never echo
  raw response bodies from an arbitrary endpoint back to the client or audit log.

**Related trap — wrong-provider key leak:** the OpenAI SDK defaults `baseURL` to
api.openai.com when none is given. A "custom"/compatible provider with an empty
base URL therefore silently sends the tenant's key to OpenAI. Guard centrally in
the client builder (throw before constructing the client) so every call site —
including the Test Connection endpoint — is protected, not just the save path.
