import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// In production, pass ssl options explicitly so pg-connection-string does not
// emit deprecation warnings about sslmode='require'/'prefer' semantics.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.NODE_ENV === "production" ? { ssl: { rejectUnauthorized: true } } : {}),
});

pool.on("error", (err) => {
  console.error("[db] Unexpected idle-client error:", err.message);
});

export const db = drizzle(pool, { schema });
