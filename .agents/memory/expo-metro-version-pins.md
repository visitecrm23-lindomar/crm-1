---
name: Expo Metro version pins
description: pnpm overrides required for the guide-app Expo artifact to start — metro-* version pinning to fix src/ file resolution errors.
---

## Rule
When adding a new Expo artifact to this workspace, add these pnpm overrides to the root `package.json` to fix Metro bundler startup failures.

## Required overrides (in `pnpm.overrides`)
```json
"metro": "0.83.7",
"metro-babel-transformer": "0.83.7",
"metro-cache": "0.83.7",
"metro-cache-key": "0.83.7",
"metro-config": "0.83.7",
"metro-core": "0.83.7",
"metro-file-map": "0.83.3",
"metro-minify-terser": "0.83.7",
"metro-resolver": "0.83.7",
"metro-runtime": "0.83.7",
"metro-source-map": "0.83.7",
"metro-symbolicate": "0.83.7",
"metro-transform-plugins": "0.83.7",
"metro-transform-worker": "0.83.7"
```

**Why:**
- `@expo+metro@54.2.0` bundles metro@0.83.3 which is missing `src/lib/TerminalReporter.js` and `metro-transform-plugins/src/index.js` — it references source files that don't exist in 0.83.3 distributions.
- Upgrading to 0.83.7 fixes the missing source files.
- **Exception:** `metro-file-map` must stay at 0.83.3 — metro-file-map@0.83.7 has an incompatible `eventsQueue` API that causes `@expo/cli@54.0.25` to crash with `TypeError: eventsQueue is not iterable` during file watching.

**How to apply:**
Edit root `package.json` → `pnpm.overrides`, add all lines above, then run `pnpm install`.
