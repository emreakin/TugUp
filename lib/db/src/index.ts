import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

function createPool() {
  const needsInsecureSsl =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false" ||
    connectionString.includes("aivencloud.com");

  if (!needsInsecureSsl) {
    return new Pool({ connectionString });
  }

  // Aiven URLs include sslmode=require which makes node-pg verify certs strictly.
  // Strip sslmode and use explicit ssl config instead.
  const cleanUrl = connectionString
    .replace(/[?&]sslmode=[^&]*/g, "")
    .replace(/\?$/, "");

  return new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });
}

export const pool = createPool();
export const db = drizzle(pool, { schema });

export * from "./schema";
