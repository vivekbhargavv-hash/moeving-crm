/**
 * Applies a drizzle migration through Neon's HTTPS SQL endpoint.
 *
 * `drizzle-kit push` opens a raw Postgres TCP connection, which is not always
 * available (corporate proxies, sandboxes, CI without egress on 5432). This
 * does the same work over HTTPS, which is reachable anywhere the Neon
 * serverless driver itself works.
 *
 *   node scripts/apply-migration.mjs drizzle/0000_xxx.sql
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-migration.mjs <path-to-sql>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const statements = readFileSync(file, "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

let applied = 0;
for (const statement of statements) {
  try {
    await sql.query(statement);
    applied++;
  } catch (error) {
    // Re-running a migration is normal; only genuine failures should stop us.
    if (/already exists/i.test(error.message)) continue;
    console.error(`\nfailed:\n${statement}\n`);
    throw error;
  }
}
console.log(`applied ${applied}/${statements.length} statements`);
