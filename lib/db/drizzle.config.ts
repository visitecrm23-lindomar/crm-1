// After modifying any file in src/schema/, always run:
//   pnpm --filter @workspace/db generate
// to create the corresponding migration file. Skipping this step will cause
// the running database to diverge silently from the Drizzle schema.
// Run `pnpm --filter @workspace/db check` (or `pnpm run schema:check` at the
// workspace root) to verify all schema changes have a corresponding migration.
import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
