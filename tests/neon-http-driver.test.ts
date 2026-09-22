import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * The driver split that cost a production release.
 *
 * `src/db/index.ts` picks node-postgres for a local database and
 * `drizzle-orm/neon-http` for Neon, which is what production runs. neon-http
 * has NO transaction support: `db.transaction()` throws
 * "No transactions support in neon-http driver" the moment it is called.
 *
 * Nothing catches that locally, because a local Postgres uses the other
 * driver and transactions work there perfectly. A delete wrapped in one
 * passed every test on this machine and threw for every real user, and the
 * screen said "check your connection".
 *
 * So the rule is a test rather than a comment somebody has to remember:
 * server code may not call `.transaction(`. If an operation ever genuinely
 * needs atomicity, the honest fixes are a single SQL statement, a stored
 * procedure, or moving production to the Neon WebSocket driver — not
 * reaching for this one and hoping.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts") || path.endsWith(".tsx")
        ? [path]
        : [];
  });
}

describe("the neon-http driver's limits", () => {
  it("has no .transaction( call anywhere in src/", () => {
    const offenders = sourceFiles("src").filter((path) => {
      // Comments are stripped first, so the paragraphs explaining this rule
      // do not trip the rule.
      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      return /\b(?:db|tx)\.transaction\s*\(/.test(code);
    });
    assert.deepEqual(
      offenders,
      [],
      `neon-http cannot run transactions, so these would throw in production but not locally:\n${offenders.join("\n")}`,
    );
  });
});
