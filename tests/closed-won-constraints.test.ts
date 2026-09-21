import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import { Client } from "pg";

/**
 * The half of the workflow that lives in Postgres: the two check constraints
 * that make a half-closed deal unwritable, and the generated columns that stop
 * two screens disagreeing about margin.
 *
 * Needs a throwaway Postgres — the schema is applied automatically if the
 * database is empty, and every test runs inside a transaction that is rolled
 * back, so nothing is left behind:
 *
 *   TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:5433/crm_test" npm test
 *
 * Without TEST_DATABASE_URL the suite skips, so `npm test` still runs the
 * logic tests anywhere.
 */

const url = process.env.TEST_DATABASE_URL;
const migrations = [
  "drizzle/0000_kind_juggernaut.sql",
  "drizzle/0001_per_vehicle_economics.sql",
];

/** A full cost sheet, per vehicle per month. */
const SHEET = {
  revenue: 48_000,
  lease_cost: 18_000,
  driver_cost: 16_000,
  charging_cost: 6_000,
  parking_cost: 1_500,
  maintenance_cost: 2_000,
  supervisor_cost: 1_200,
  misc_cost: 300,
};
const COST_PER_VEHICLE = 45_000; // the seven costs above
const MARGIN_PER_VEHICLE = 3_000;

describe(
  "Closed Won / Closed Lost constraints",
  { skip: url ? false : "set TEST_DATABASE_URL to run the database tests" },
  () => {
    const client = new Client({ connectionString: url });
    let orgId: string;
    let ownerId: string;
    let accountId: string;
    let reasonId: string;

    before(async () => {
      await client.connect();
      const { rows } = await client.query(
        "select to_regclass('public.opportunities') as t",
      );
      if (!rows[0]?.t) {
        for (const file of migrations) {
          await client.query(
            await readFile(path.join(process.cwd(), file), "utf8"),
          );
        }
      }
    });

    after(async () => {
      await client.end();
    });

    // Every test is its own transaction, rolled back afterwards — the fixtures
    // below never reach disk, so the suite is safe to point at a scratch
    // database repeatedly.
    afterEach(async () => {
      await client.query("rollback");
    });

    beforeEach(async () => {
      await client.query("begin");
      orgId = await one(
        "insert into organizations (name, slug) values ('Test Co', 'test-' || gen_random_uuid()) returning id",
      );
      ownerId = await one(
        "insert into users (organization_id, email, name) values ($1, 'owner-' || gen_random_uuid() || '@example.com', 'Test Owner') returning id",
        [orgId],
      );
      accountId = await one(
        "insert into accounts (organization_id, name) values ($1, 'Acme Logistics') returning id",
        [orgId],
      );
      reasonId = await one(
        "insert into lost_reasons (organization_id, label) values ($1, 'Price') returning id",
        [orgId],
      );
    });

    async function one(sql: string, params: unknown[] = []) {
      const { rows } = await client.query(sql, params);
      return rows[0].id as string;
    }

    /** Insert an opportunity; `extra` is merged over the open-deal defaults. */
    async function insertOpp(extra: Record<string, unknown> = {}) {
      const values: Record<string, unknown> = {
        organization_id: orgId,
        account_id: accountId,
        owner_user_id: ownerId,
        name: "Acme Logistics - Pune",
        stage: "first_contact",
        fleet_size: 10,
        price: 48_000,
        ...extra,
      };
      const keys = Object.keys(values);
      const { rows } = await client.query(
        `insert into opportunities (${keys.map((k) => `"${k}"`).join(", ")})
         values (${keys.map((_, i) => `$${i + 1}`).join(", ")})
         returning *`,
        keys.map((k) => values[k]),
      );
      return rows[0];
    }

    async function rejects(fn: () => Promise<unknown>, constraint: string) {
      await assert.rejects(fn, (err: unknown) => {
        const e = err as { constraint?: string; message?: string };
        assert.equal(
          e.constraint,
          constraint,
          `expected ${constraint}, got ${e.constraint ?? e.message}`,
        );
        return true;
      });
      // A violated constraint aborts the transaction; the fixtures are gone
      // either way because the whole test rolls back.
      await client.query("rollback");
      await client.query("begin");
    }

    it("refuses a won deal with no cost sheet at all", async () => {
      await rejects(
        () => insertOpp({ stage: "closed_won" }),
        "opps_won_requires_costs",
      );
    });

    it("refuses a won deal that is one cost short", async () => {
      for (const missing of Object.keys(SHEET)) {
        const sheet: Record<string, unknown> = { ...SHEET };
        sheet[missing] = null;
        await rejects(
          () => insertOpp({ stage: "closed_won", ...sheet }),
          "opps_won_requires_costs",
        );
      }
    });

    it("refuses to move an open deal to won without the sheet", async () => {
      const opp = await insertOpp({ stage: "negotiation" });
      await rejects(
        () =>
          client.query(
            "update opportunities set stage = 'closed_won' where id = $1",
            [opp.id],
          ),
        "opps_won_requires_costs",
      );
    });

    it("accepts a won deal with the whole sheet", async () => {
      const opp = await insertOpp({ stage: "closed_won", ...SHEET });
      assert.equal(opp.stage, "closed_won");
      assert.equal(opp.cost_per_vehicle, COST_PER_VEHICLE);
      assert.equal(opp.margin_per_vehicle, MARGIN_PER_VEHICLE);
    });

    it("scales the deal-level figures by the fleet", async () => {
      const opp = await insertOpp({
        stage: "closed_won",
        fleet_size: 10,
        ...SHEET,
      });
      assert.equal(opp.total_revenue, SHEET.revenue * 10);
      assert.equal(opp.total_cost, COST_PER_VEHICLE * 10);
      assert.equal(opp.gross_margin, MARGIN_PER_VEHICLE * 10);
    });

    it("rescales a won deal when the fleet changes, leaving no stale total", async () => {
      const opp = await insertOpp({ stage: "closed_won", fleet_size: 10, ...SHEET });
      const { rows } = await client.query(
        "update opportunities set fleet_size = 25 where id = $1 returning *",
        [opp.id],
      );
      assert.equal(rows[0].gross_margin, MARGIN_PER_VEHICLE * 25);
      assert.equal(rows[0].margin_per_vehicle, MARGIN_PER_VEHICLE);
    });

    it("reports the same margin percentage per vehicle and per deal", async () => {
      const a = await insertOpp({ stage: "closed_won", fleet_size: 1, ...SHEET });
      const b = await insertOpp({ stage: "closed_won", fleet_size: 400, ...SHEET });
      assert.equal(a.margin_pct, b.margin_pct);
      assert.equal(Number(a.margin_pct), 6.25); // 3000 / 48000
    });

    it("leaves margin percentage null when there is no revenue", async () => {
      const opp = await insertOpp({ stage: "negotiation" });
      assert.equal(opp.margin_pct, null);
      assert.equal(opp.cost_per_vehicle, 0);
    });

    it("refuses a lost deal with no reason", async () => {
      await rejects(
        () => insertOpp({ stage: "closed_lost" }),
        "opps_lost_requires_reason",
      );
    });

    it("accepts a lost deal with a reason", async () => {
      const opp = await insertOpp({
        stage: "closed_lost",
        lost_reason_id: reasonId,
        lost_reason_note: "Went with the incumbent",
      });
      assert.equal(opp.lost_reason_id, reasonId);
    });

    it("lets every other stage move with nothing attached", async () => {
      for (const stage of [
        "first_contact",
        "solutioning",
        "proposal",
        "negotiation",
        "dormant",
      ]) {
        const opp = await insertOpp({ stage });
        assert.equal(opp.stage, stage);
      }
    });

    it("refuses a deal with no vehicles in it", async () => {
      await rejects(() => insertOpp({ fleet_size: 0 }), "opps_fleet_positive");
    });
  },
);
