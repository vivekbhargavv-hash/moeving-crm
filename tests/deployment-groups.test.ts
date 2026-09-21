import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupByCity, groupByDueDate } from "@/lib/deployment-groups";

/**
 * The Deployments queue's two groupings.
 *
 * Every case is pinned to a fixed "today" — 21 September 2026 — because the
 * boundaries are the whole point: what counts as overdue, and where this week
 * stops being this week.
 */
const TODAY = "2026-09-21";
const NOW = new Date("2026-09-21T09:00:00Z");

function job(
  deploymentDate: string | null,
  city: string | null = "Delhi NCR",
  vehicleType: string | null = "1 Tonne",
  fleetSize = 10,
  vehiclesDeployed = 0,
) {
  return { deploymentDate, city, vehicleType, fleetSize, vehiclesDeployed };
}

describe("groupByDueDate", () => {
  it("puts yesterday in Overdue and today in This week", () => {
    const groups = groupByDueDate(
      [job("2026-09-20"), job(TODAY)],
      TODAY,
      NOW,
    );
    assert.deepEqual(
      groups.map((g) => g.label),
      ["Overdue", "This week"],
    );
    assert.equal(groups[0]!.tone, "bad");
    assert.equal(groups[1]!.tone, undefined);
  });

  it("cuts This week at seven days and Next week at fourteen", () => {
    const groups = groupByDueDate(
      [
        job("2026-09-28"), // +7 — still this week
        job("2026-09-29"), // +8 — next week
        job("2026-10-05"), // +14 — still next week
        job("2026-10-06"), // +15 — falls through to its month
      ],
      TODAY,
      NOW,
    );
    assert.deepEqual(
      groups.map((g) => [g.label, g.rows.length]),
      [
        ["This week", 1],
        ["Next week", 2],
        ["October 2026", 1],
      ],
    );
  });

  it("orders sections Overdue, week, week, months, then undated", () => {
    const groups = groupByDueDate(
      [
        job(null),
        job("2026-11-10"),
        job("2026-09-22"),
        job("2026-09-01"),
        job("2026-10-20"),
      ],
      TODAY,
      NOW,
    );
    assert.deepEqual(
      groups.map((g) => g.label),
      ["Overdue", "This week", "October 2026", "November 2026", "No date set"],
    );
  });

  it("sorts the soonest job to the top of its section", () => {
    // All three are past the fourteen-day cut, so they share one month section.
    const groups = groupByDueDate(
      [job("2026-10-31"), job("2026-10-06"), job("2026-10-17")],
      TODAY,
      NOW,
    );
    assert.equal(groups[0]!.label, "October 2026");
    assert.deepEqual(
      groups[0]!.rows.map((r) => r.deploymentDate),
      ["2026-10-06", "2026-10-17", "2026-10-31"],
    );
  });

  it("leaves the array it was given alone", () => {
    const rows = [job("2026-10-31"), job("2026-10-02")];
    groupByDueDate(rows, TODAY, NOW);
    assert.deepEqual(
      rows.map((r) => r.deploymentDate),
      ["2026-10-31", "2026-10-02"],
    );
  });
});

describe("groupByCity", () => {
  it("leads with the city that needs trucks soonest", () => {
    const groups = groupByCity([
      job("2026-10-20", "Mumbai"),
      job("2026-09-24", "Bangalore"),
      job("2026-09-15", "Delhi NCR"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.label),
      ["Delhi NCR", "Bangalore", "Mumbai"],
    );
  });

  it("says when a city is one load plan and when it is several", () => {
    const groups = groupByCity([
      job("2026-09-24", "Bangalore", "Ultra E7"),
      job("2026-10-20", "Bangalore", "Ultra E7"),
      job("2026-09-15", "Delhi NCR", "1 Tonne"),
      job("2026-09-16", "Delhi NCR", "1.7 Tonne"),
    ]);
    const note = (label: string) =>
      groups.find((g) => g.label === label)?.note;
    assert.equal(note("Bangalore"), "all Ultra E7");
    assert.equal(note("Delhi NCR"), "2 types");
  });

  it("keeps a deal with no city, and sorts a dateless city last", () => {
    const groups = groupByCity([
      job(null, null),
      job("2026-09-24", "Bangalore"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.label),
      ["Bangalore", "No city"],
    );
  });
});
