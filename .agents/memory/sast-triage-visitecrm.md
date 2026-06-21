---
name: SAST triage — recurring false positives & fix patterns
description: Which Semgrep "medium" findings in VisiteCRM are real vs recurring false positives, and the source-validation pattern for fixing reflected injection.
---

# SAST triage for VisiteCRM (Semgrep medium findings)

A full security scan reports ~140 medium findings, ~0 critical/high. Most are recurring false positives. Triage rule: for `html-in-template-string`, **trace each interpolated variable to its definition** before flagging — the template literal is flagged for the interpolation, but the value is often already escaped upstream.

## Recurring FALSE POSITIVES (do not "fix" these)
- **trips.ts `generateManifestHtml`**: every header/crew var (tripName, destination, organizador, driver*, tourGuide*, etc.) is pre-escaped at its `const` definition via the local `e = escapeHtmlServer`. The big template just interpolates already-escaped consts.
- **reminder.worker.ts / email-helpers.ts / store-public.ts result page / PassengersListManifest.ts**: each already applies its own escape helper (escapeHtml / escapeHtmlEmail / manual `<`-replace) before interpolation.
- **`ilike(table.col, \`%${x}%\`)`** (clients.ts, trips.ts `/trips` search): `${x}` flows into Drizzle `ilike()`, which is parameterized — not raw SQL/HTML. Flagged as raw-html-format but safe.
- **`new RegExp(\`...${key}...\`)`** in whatsapp.ts `interpolateWhatsAppMessage` and indicacoes.tsx preview: `key` is a hardcoded literal ("nome","codigo","valor",…); only the replacement VALUE comes from user input (passed as String.replace 2nd arg, not into RegExp). No ReDoS vector.
- **serve-static.mjs path traversal**: `new URL(req.url,'http://localhost').pathname` normalizes `..` segments (cannot escape root) and leaves `%2e`/`%2f` percent-encoded, so `path.join(ROOT, pathname)` treats them as literal filenames. Verified empirically — not exploitable.

## REAL issues found & fixed (HTML injection of user data)
- **nps.ts**: `agencyName` (tenant name) was interpolated raw into the PUBLIC thank-you page served as text/html to the agency's clients → cross-tenant stored XSS. Fixed by escaping.
- **partners.ts commissions PDF**: `partnerName`/`partnerEmail` rows escaped.

## Fix pattern: validate attacker-controlled query params at the SOURCE
The `period` query param (partners.ts `/parceiros/commissions`) reached `<title>`, `formattedPeriod`, the CSV body, AND the `Content-Disposition` filename. Instead of escaping each sink, constrain at the source: `/^\d{4}-(0[1-9]|1[0-2])$/` test with fallback to current `YYYY-MM`. One validation neutralizes every downstream sink at once.
**Why:** per-sink escaping is easy to miss one sink (the filename header isn't HTML); a tight source regex makes the value structurally incapable of carrying a payload.
