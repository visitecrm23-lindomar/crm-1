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

  const sslmode = url.searchParams.get("sslmode");
  let ssl: pg.PoolConfig["ssl"];
  if (sslmode === "disable" || sslmode === "" || url.protocol === "postgres:" && url.hostname === "localhost") {
    ssl = false;
  } else if (sslmode === "no-verify" || sslmode === "require" || sslmode === "prefer" || sslmode === "verify-ca" || sslmode === null) {
    ssl = { rejectUnauthorized: false };
  } else if (sslmode === "verify-full") {
    ssl = { rejectUnauthorized: true };
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
