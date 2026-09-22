import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_STAGE_PROBABILITY } from "@/lib/constants";
import {
  parsePeriod,
  periodStart,
  summarizeDashboard,
  type StageTotals,
} from "@/lib/dashboard";

const stage = (s: Partial<StageTotals> & Pick<StageTotals, "stage">): StageTotals => ({
  count: 0,
  fleet: 0,
  value: 0,
  wonValue: 0,
  revenue: 0,
  margin: 0,
  ...s,
});

describe("periodStart", () => {
  it("is null for all time", () => {
    assert.equal(periodStart("all"), null);
  });

  it("starts the financial year on 1 April, midnight in India", () => {
    const now = new Date("2026-09-22T10:00:00Z");
    assert.equal(periodStart("fy", now)?.toISOString(), "2026-03-31T18:30:00.000Z");
  });

  it("keeps January to March in the financial year that began the April before", () => {
    const now = new Date("2027-02-10T10:00:00Z");
    assert.equal(periodStart("fy", now)?.toISOString(), "2026-03-31T18:30:00.000Z");
  });

  it("starts the quarter on the first of its month in India", () => {
    const now = new Date("2026-09-22T10:00:00Z");
    assert.equal(periodStart("quarter", now)?.toISOString(), "2026-06-30T18:30:00.000Z");
  });

  it("counts the quarter by India's date, not UTC's", () => {
    // 20:00 UTC on 30 Sep is already 1 Oct in India: a new quarter.
    const now = new Date("2026-09-30T20:00:00Z");
    assert.equal(periodStart("quarter", now)?.toISOString(), "2026-09-30T18:30:00.000Z");
  });

  it("goes back ninety days for the rolling window", () => {
    const now = new Date("2026-09-22T10:00:00Z");
    assert.equal(periodStart("90d", now)?.toISOString(), "2026-06-24T10:00:00.000Z");
  });

  it("reads anything unknown in the URL as all time", () => {
    assert.equal(parsePeriod("forever"), "all");
    assert.equal(parsePeriod(undefined), "all");
    assert.equal(parsePeriod("fy"), "fy");
  });
});

describe("summarizeDashboard", () => {
  const data = summarizeDashboard(
    [
      stage({ stage: "first_contact", count: 2, fleet: 10, value: 100_000 }),
      stage({ stage: "negotiation", count: 1, fleet: 5, value: 200_000 }),
      stage({
        stage: "closed_won",
        count: 3,
        fleet: 12,
        value: 300_000,
        wonValue: 320_000,
        revenue: 250_000,
        margin: 50_000,
      }),
      stage({ stage: "closed_lost", count: 1 }),
    ],
    [
      { owner: "Asha", city: "Pune", vehicleType: "3W", fleet: 10, value: 100_000 },
      { owner: "Asha", city: null, vehicleType: "3W", fleet: 5, value: 200_000 },
    ],
    DEFAULT_STAGE_PROBABILITY,
  );

  it("adds up the open stages and weights them by their odds", () => {
    assert.equal(data.kpis.pipelineValue, 300_000);
    assert.equal(data.kpis.openCount, 3);
    assert.equal(data.kpis.fleetInPipeline, 15);
    // 10% of 1L + 75% of 2L
    assert.equal(data.kpis.weightedPipeline, 160_000);
  });

  it("reads won and lost from their own stages", () => {
    assert.equal(data.kpis.wonValue, 320_000);
    assert.equal(data.kpis.wonCount, 3);
    assert.equal(data.kpis.winRate, 75);
    assert.equal(data.kpis.grossMargin, 50_000);
    assert.equal(data.kpis.marginPct, 20);
  });

  it("gives an empty stage a zero row in the funnel rather than a gap", () => {
    const proposal = data.funnel.find((f) => f.stage === "proposal");
    assert.deepEqual(proposal, { stage: "proposal", count: 0, value: 0, fleet: 0 });
  });

  it("rolls the open groups up per dimension, largest first", () => {
    assert.deepEqual(data.byOwner, [{ name: "Asha", value: 300_000, fleet: 15 }]);
    assert.deepEqual(
      data.byCity.map((c) => c.name),
      ["Unassigned", "Pune"],
    );
  });

  it("has no win rate until something is decided", () => {
    const empty = summarizeDashboard([], [], DEFAULT_STAGE_PROBABILITY);
    assert.equal(empty.kpis.winRate, null);
    assert.equal(empty.kpis.marginPct, null);
  });
});
