---
name: DB package TypeScript build
description: When DB schema gains new columns, the compiled .d.ts in lib/db/dist and lib/api-zod/dist go stale and TS check fails on new column references.
---

When a new column is added to `lib/db/src/schema/*.ts`, the TypeScript declaration files in `lib/db/dist/` and `lib/api-zod/dist/` must be regenerated or the api-server `tsc --noEmit` will report "Property X does not exist on type Y" for the new columns.

**Why:** The api-server tsconfig uses project references (`references: [{path: "../../lib/db"}]`) with `composite: true`, so it reads .d.ts from `dist/`, not source .ts files directly.

**How to apply:** After any schema column addition, run:
```
cd lib/db && npx tsc --build
cd lib/api-zod && npx tsc --build
```
These are fast (emit-only). Runtime behavior is unaffected since tsx/esbuild reads source directly; only `tsc --noEmit` type checks are impacted.
