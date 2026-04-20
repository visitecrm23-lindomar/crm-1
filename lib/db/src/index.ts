import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function buildPoolConfig(rawUrl: string): pg.PoolConfig {
  const url = new URL(rawUrl);

  const isPostgresProto = url.protocol === "postgres:" || url.protocol === "postgresql:";
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  const sslmode = url.searchParams.get("sslmode");
  let ssl: pg.PoolConfig["ssl"];
  if (sslmode === "disable" || sslmode === "") {
    ssl = false;
  } else if (sslmode === "verify-full") {
    ssl = { rejectUnauthorized: true };
  } else if (sslmode === "no-verify" || sslmode === "require" || sslmode === "prefer" || sslmode === "verify-ca") {
    // Preserve current behavior: TLS on, but accept self-signed certs as
    // used by Replit-managed Postgres.
    ssl = { rejectUnauthorized: false };
  } else if (sslmode === null) {
    // No sslmode in the URL: default to off for local dev, TLS-with-permissive
    // verification for remote hosts (matches typical hosted-DB behavior).
    ssl = isPostgresProto && isLocalhost ? false : { rejectUnauthorized: false };
  } else {
    ssl = { rejectUnauthorized: false };
  }

  const port = url.port ? Number(url.port) : 5432;
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || undefined;
  const user = url.username ? decodeURIComponent(url.username) : undefined;
  const password = url.password ? decodeURIComponent(url.password) : undefined;

  return {
    host: url.hostname,
    port,
    database,
    user,
    password,
    ssl,
  };
}

export const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));

pool.on("error", (err) => {
  console.error("[db] Unexpected idle-client error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
