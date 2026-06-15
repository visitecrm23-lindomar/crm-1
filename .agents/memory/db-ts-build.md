---
name: Workspace lib TypeScript build (project references)
description: Consumers resolve workspace libs (lib/db, lib/api-zod, lib/api-client-react) via compiled dist/*.d.ts through project references, so stale dist breaks tsc after schema changes OR after adding a new exported source file.
---

Consumers in this monorepo (api-server, visitecrm, etc.) type-check workspace libraries through their compiled `dist/*.d.ts`, NOT their source `.ts`. So the dist must be rebuilt after EITHER:
- adding a new column to `lib/db/src/schema/*.ts` (→ `tsc --noEmit` reports "Property X does not exist on type Y"), OR
- adding/exporting a NEW source file in a lib (e.g. `lib/api-client-react/src/insights-advanced.ts`). Until you rebuild, consumers get TS2305 "Module has no exported member …" for the new hooks/types even though `src/index.ts` exports them.

**Why:** Consumer tsconfigs use project `references` (e.g. `references: [{path: "../../lib/api-client-react"}]`) with `composite: true`, so TS reads `dist/` declarations, not source. A package `exports` map pointing at `./src` does not override this for `tsc`.

**How to apply:** After such changes, rebuild the affected lib's dist (fast, emit-only):
```
cd lib/db && npx tsc --build
cd lib/api-zod && npx tsc --build
cd lib/api-client-react && npx tsc --build   # use --force if dist looks stale
```
Runtime is unaffected (vite/tsx/esbuild read source directly); only `tsc` type checks are impacted. tsc may OOM at 2048MB — run via `node --max-old-space-size=6144 $(node -e "console.log(require.resolve('typescript/bin/tsc'))") --build`.
