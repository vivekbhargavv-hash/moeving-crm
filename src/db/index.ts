import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

/**
 * Neon over HTTP in production (no connection pool to exhaust on serverless),
 * plain node-postgres against anything else so a local Postgres works for
 * development and tests without touching application code.
 */
const isNeon = url.includes("neon.tech");

export const db = isNeon
  ? drizzleHttp(neon(url), { schema })
  : drizzleNode(new Pool({ connectionString: url }), { schema });

export { schema };
