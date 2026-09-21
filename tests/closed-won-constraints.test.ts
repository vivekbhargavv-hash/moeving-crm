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
  "drizzle/0002_contracting_stage.sql",
  "drizzle/0003_expansions_and_invites.sql",
  "drizzle/0004_invite_link.sql",
  "drizzle/0005_ops_role.sql",
  "drizzle/0006_deployments.sql",
];

/** A won deal must also carry a deployment date; see 0006. */
const DEPLOY_ON = "2026-11-30";

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
        // A won deal needs one, and every won fixture here is testing
        // something else; a test that cares passes its own.
        ...(extra.stage === "closed_won" ? { deployment_date: DEPLOY_ON } : {}),
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

    it("refuses a won deal ops cannot schedule", async () => {
      await rejects(
        () => insertOpp({ stage: "closed_won", ...SHEET, deployment_date: null }),
        "opps_won_requires_deployment_date",
      );
    });

    it("keeps the deployment date apart from the sales forecast", async () => {
      const opp = await insertOpp({
        stage: "closed_won",
        ...SHEET,
        expected_close_date: "2026-09-30",
        deployment_date: DEPLOY_ON,
      });
      // Two different questions, two different answers. Ops reads the second.
      assert.equal(opp.expected_close_date.toISOString().slice(0, 10), "2026-09-30");
      assert.equal(opp.deployment_date.toISOString().slice(0, 10), DEPLOY_ON);
    });

    it("starts a won deal with nothing deployed", async () => {
      const opp = await insertOpp({ stage: "closed_won", ...SHEET });
      assert.equal(opp.vehicles_deployed, 0);
    });

    it("records a partial deployment", async () => {
      const opp = await insertOpp({ stage: "closed_won", fleet_size: 12, ...SHEET });
      const { rows } = await client.query(
        "update opportunities set vehicles_deployed = 8 where id = $1 returning vehicles_deployed, fleet_size",
        [opp.id],
      );
      assert.equal(rows[0].vehicles_deployed, 8);
      assert.equal(rows[0].fleet_size, 12);
    });

    it("refuses more vehicles deployed than the deal is for", async () => {
      const opp = await insertOpp({ stage: "closed_won", fleet_size: 12, ...SHEET });
      await rejects(
        () =>
          client.query(
            "update opportunities set vehicles_deployed = 13 where id = $1",
            [opp.id],
          ),
        "opps_deployed_within_fleet",
      );
    });

    it("refuses a negative deployed count", async () => {
      await rejects(
        () => insertOpp({ stage: "closed_won", ...SHEET, vehicles_deployed: -1 }),
        "opps_deployed_within_fleet",
      );
    });

    it("refuses shrinking a fleet below what is already deployed", async () => {
      // The app clamps instead (see updateOpportunity); this pins the rule the
      // clamp exists to respect.
      const opp = await insertOpp({
        stage: "closed_won",
        fleet_size: 12,
        vehicles_deployed: 10,
        ...SHEET,
      });
      await rejects(
        () =>
          client.query("update opportunities set fleet_size = 5 where id = $1", [
            opp.id,
          ]),
        "opps_deployed_within_fleet",
      );
    });

    it("has an ops role", async () => {
      const { rows } = await client.query(
        "select unnest(enum_range(null::user_role))::text as role",
      );
      assert.deepEqual(
        rows.map((r) => r.role).sort(),
        ["admin", "ops", "sales"],
      );
    });

    it("puts Contracting between Negotiation and Closed Won", async () => {
      const { rows } = await client.query(
        "select unnest(enum_range(null::sales_stage))::text as stage",
      );
      const order = rows.map((r) => r.stage);
      assert.equal(order.indexOf("contracting"), order.indexOf("negotiation") + 1);
      assert.equal(order.indexOf("closed_won"), order.indexOf("contracting") + 1);
    });

    it("treats Contracting as an ordinary open stage, needing nothing extra", async () => {
      const opp = await insertOpp({ stage: "contracting" });
      assert.equal(opp.stage, "contracting");
      assert.equal(opp.closed_at, null);
    });

    it("links a follow-on deployment to the deal it grew out of", async () => {
      // The month a deal was won is what the wins report counts it in, so the
      // close date is the thing a follow-on must not disturb.
      const closedAt = "2026-08-21T10:00:00Z";
      const won = await insertOpp({
        stage: "closed_won",
        fleet_size: 15,
        closed_at: closedAt,
        ...SHEET,
      });
      const expansion = await insertOpp({
        name: "Acme Logistics - Pune (phase 2)",
        fleet_size: 8,
        parent_opportunity_id: won.id,
      });
      assert.equal(expansion.parent_opportunity_id, won.id);

      // The whole point: the won deal is untouched, so the month it closed in
      // still counts it.
      const { rows } = await client.query(
        "select stage, closed_at, fleet_size, gross_margin from opportunities where id = $1",
        [won.id],
      );
      assert.equal(rows[0].stage, "closed_won");
      assert.equal(rows[0].fleet_size, 15);
      assert.equal(rows[0].gross_margin, MARGIN_PER_VEHICLE * 15);
      assert.equal(
        new Date(rows[0].closed_at).toISOString(),
        new Date(closedAt).toISOString(),
      );
    });

    it("leaves a follow-on standing when its parent is deleted", async () => {
      const parent = await insertOpp({ stage: "negotiation" });
      const child = await insertOpp({ parent_opportunity_id: parent.id });
      await client.query("delete from opportunities where id = $1", [parent.id]);
      const { rows } = await client.query(
        "select id, parent_opportunity_id from opportunities where id = $1",
        [child.id],
      );
      assert.equal(rows.length, 1, "the follow-on must survive its parent");
      assert.equal(rows[0].parent_opportunity_id, null);
    });

    it("refuses a parent that is not a real deal", async () => {
      await assert.rejects(() =>
        insertOpp({ parent_opportunity_id: "11111111-1111-1111-1111-111111111111" }),
      );
      await client.query("rollback");
      await client.query("begin");
    });
  },
);
