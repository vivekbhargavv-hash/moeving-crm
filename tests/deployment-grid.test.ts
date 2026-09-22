import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDeploymentGrid } from "@/lib/deployment-grid";

/**
 * The Deployments grid — city down the side, month across the top.
 *
 * The cases worth pinning are the ones a screenshot would not tell you: that
 * the columns run month by month with no gaps, that a deal with no date is
 * kept rather than quietly dropped, and that a cell counts vehicles promised
 * while still knowing how many of them are not out yet.
 */
function job(
  deploymentDate: string | null,
  city: string | null = "Delhi NCR",
  fleetSize = 10,
  vehiclesDeployed = 0,
  vehicleType: string | null = "1T Tata Ace",
) {
  return { deploymentDate, city, vehicleType, fleetSize, vehiclesDeployed };
}

describe("buildDeploymentGrid", () => {
  it("spans the data's own months, and keeps the empty ones in between", () => {
    // Sep, Nov, Jan with the gaps removed reads as a stride, not a calendar —
    // and "what does October look like" is a question the blank answers.
    const grid = buildDeploymentGrid([
      job("2026-12-04"),
      job("2026-10-20"),
      job("2026-10-02"),
    ]);
    assert.deepEqual(grid.months, ["2026-10", "2026-11", "2026-12"]);
    assert.equal(grid.rows[0]!.cells[1]!.vehicles, 0);
  });

  it("carries a span across a year boundary", () => {
    const grid = buildDeploymentGrid([job("2026-11-30"), job("2027-02-01")]);
    assert.deepEqual(grid.months, [
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("keeps months already gone, because overdue is the point", () => {
    const grid = buildDeploymentGrid([job("2026-08-30"), job("2026-10-01")]);
    assert.equal(grid.months[0], "2026-08");
  });

  it("counts vehicles promised, and how many are still to go", () => {
    const grid = buildDeploymentGrid([
      job("2026-10-05", "Bangalore", 12, 5),
      job("2026-10-19", "Bangalore", 8, 8),
    ]);
    const cell = grid.rows[0]!.cells[0]!;
    assert.equal(cell.vehicles, 20);
    assert.equal(cell.remaining, 7);
    assert.equal(cell.items.length, 2);
  });

  it("never lets an over-recorded count read as negative work left", () => {
    // Ops can record every vehicle out and the fleet later shrink on an edit.
    const grid = buildDeploymentGrid([job("2026-10-05", "Pune", 4, 6)]);
    assert.equal(grid.rows[0]!.total.remaining, 0);
  });

  it("splits one city across the months it is owed in", () => {
    const grid = buildDeploymentGrid([
      job("2026-10-05", "Mumbai", 3),
      job("2026-11-05", "Mumbai", 7),
    ]);
    assert.equal(grid.rows.length, 1);
    assert.deepEqual(
      grid.rows[0]!.cells.map((c) => c.vehicles),
      [3, 7],
    );
    assert.equal(grid.rows[0]!.total.vehicles, 10);
  });

  it("leads with the city owing the most trucks", () => {
    const grid = buildDeploymentGrid([
      job("2026-10-05", "Pune", 4),
      job("2026-10-06", "Hyderabad", 30),
      job("2026-10-07", "Kolkata", 11),
    ]);
    assert.deepEqual(
      grid.rows.map((r) => r.city),
      ["Hyderabad", "Kolkata", "Pune"],
    );
  });

  it("sorts a cell's clients soonest first", () => {
    const grid = buildDeploymentGrid([
      job("2026-10-28", "Delhi NCR", 1),
      job("2026-10-03", "Delhi NCR", 2),
    ]);
    assert.deepEqual(
      grid.rows[0]!.cells[0]!.items.map((d) => d.deploymentDate),
      ["2026-10-03", "2026-10-28"],
    );
  });

  it("sets a dateless deal aside rather than dropping it", () => {
    const grid = buildDeploymentGrid([job(null), job("2026-10-05")]);
    assert.equal(grid.undated.length, 1);
    assert.equal(grid.total.vehicles, 10);
  });

  it("files a deal with no city under one heading rather than losing it", () => {
    const grid = buildDeploymentGrid([job("2026-10-05", null, 6)]);
    assert.deepEqual(
      grid.rows.map((r) => r.city),
      ["No city"],
    );
    assert.equal(grid.rows[0]!.total.vehicles, 6);
  });

  it("totals each month and the whole grid the same way", () => {
    const grid = buildDeploymentGrid([
      job("2026-10-05", "Pune", 4, 1),
      job("2026-11-05", "Pune", 6, 0),
      job("2026-11-08", "Mumbai", 5, 5),
    ]);
    assert.deepEqual(
      grid.monthTotals.map((t) => t.vehicles),
      [4, 11],
    );
    assert.deepEqual(grid.months, ["2026-10", "2026-11"]);
    assert.equal(grid.total.vehicles, 15);
    assert.equal(grid.total.remaining, 9);
  });

  it("has no months and no rows when nothing is dated", () => {
    const grid = buildDeploymentGrid([job(null), job(null)]);
    assert.deepEqual(grid.months, []);
    assert.deepEqual(grid.rows, []);
    assert.equal(grid.undated.length, 2);
  });
});
