import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFunnel, within, type FunnelLead } from "@/lib/lead-funnel";

/**
 * The inbound funnel, and the denominators everybody argues about.
 *
 * The rule under test is that every rate is out of ENQUIRIES, not out of the
 * step before it — a desk that rang two leads and converted both must not
 * report 100%.
 */
const DAY = 86_400_000;
const NOW = new Date("2026-09-22T12:00:00Z");

function lead(over: Partial<FunnelLead> = {}): FunnelLead {
  return {
    createdAt: new Date("2026-09-01T09:00:00Z"),
    actionedAt: null,
    convertedAt: null,
    status: "new",
    dealStage: null,
    ...over,
  };
}

describe("buildFunnel", () => {
  it("measures every rate against the enquiries, not the previous step", () => {
    // Ten enquiries, two rung back, both converted, both won. Against the
    // previous step that reads 100%; against the enquiries it is 20%.
    const leads = [
      ...Array.from({ length: 8 }, () => lead()),
      lead({
        status: "converted",
        actionedAt: new Date("2026-09-01T10:00:00Z"),
        convertedAt: new Date("2026-09-02T10:00:00Z"),
        dealStage: "closed_won",
      }),
      lead({
        status: "converted",
        actionedAt: new Date("2026-09-01T10:00:00Z"),
        convertedAt: new Date("2026-09-02T10:00:00Z"),
        dealStage: "closed_won",
      }),
    ];
    const f = buildFunnel(leads);
    assert.equal(f.enquiries, 10);
    assert.equal(f.converted, 2);
    assert.equal(f.won, 2);
    assert.equal(f.convertedPct, 20);
    assert.equal(f.wonPct, 20);
    // The one rate that is out of the conversions, because it answers a
    // different question.
    assert.equal(f.wonOfConvertedPct, 100);
  });

  it("counts a conversion as having been called back", () => {
    // A lead can go straight from the enquiry to a deal on the same call.
    const f = buildFunnel([lead({ status: "converted", dealStage: "proposal" })]);
    assert.equal(f.called, 1);
    assert.equal(f.uncalled, 0);
    assert.equal(f.qualified, 1);
  });

  it("separates won, lost and still open among the deals raised", () => {
    const f = buildFunnel([
      lead({ status: "converted", dealStage: "closed_won" }),
      lead({ status: "converted", dealStage: "closed_lost" }),
      lead({ status: "converted", dealStage: "negotiation" }),
    ]);
    assert.equal(f.won, 1);
    assert.equal(f.lost, 1);
    assert.equal(f.open, 1);
  });

  it("reports no rate at all rather than 0% when nothing came in", () => {
    const f = buildFunnel([]);
    assert.equal(f.enquiries, 0);
    assert.equal(f.convertedPct, null);
    assert.equal(f.wonPct, null);
    assert.equal(f.wonOfConvertedPct, null);
  });

  it("gives the median callback wait, not the mean", () => {
    // 1, 2 and 100 hours. A mean says 34 hours, which describes no lead here.
    const base = new Date("2026-09-01T00:00:00Z");
    const f = buildFunnel([
      lead({ createdAt: base, actionedAt: new Date(base.getTime() + 3_600_000) }),
      lead({ createdAt: base, actionedAt: new Date(base.getTime() + 7_200_000) }),
      lead({ createdAt: base, actionedAt: new Date(base.getTime() + 360_000_000) }),
    ]);
    assert.equal(f.medianHoursToCall, 2);
  });

  it("averages the middle two when the count is even", () => {
    const base = new Date("2026-09-01T00:00:00Z");
    const f = buildFunnel([
      lead({ createdAt: base, actionedAt: new Date(base.getTime() + 3_600_000) }),
      lead({ createdAt: base, actionedAt: new Date(base.getTime() + 2 * 3_600_000) }),
      lead({ createdAt: base, actionedAt: new Date(base.getTime() + 4 * 3_600_000) }),
      lead({ createdAt: base, actionedAt: new Date(base.getTime() + 6 * 3_600_000) }),
    ]);
    assert.equal(f.medianHoursToCall, 3);
  });

  it("ignores a callback recorded before its own enquiry", () => {
    // An imported or corrected row can do this; a negative wait is not a fast
    // callback, it is a row that cannot answer the question.
    const base = new Date("2026-09-10T00:00:00Z");
    const f = buildFunnel([
      lead({ createdAt: base, actionedAt: new Date(base.getTime() - DAY) }),
      lead({ createdAt: base, actionedAt: new Date(base.getTime() + 3_600_000) }),
    ]);
    assert.equal(f.medianHoursToCall, 1);
  });

  it("has no median when nobody has been rung back", () => {
    const f = buildFunnel([lead(), lead()]);
    assert.equal(f.medianHoursToCall, null);
    assert.equal(f.medianDaysToConvert, null);
    assert.equal(f.uncalled, 2);
  });

  it("counts a not-qualified lead as called but never as qualified", () => {
    const f = buildFunnel([
      lead({ status: "not_qualified", actionedAt: new Date("2026-09-02T00:00:00Z") }),
    ]);
    assert.equal(f.called, 1);
    assert.equal(f.notQualified, 1);
    assert.equal(f.qualified, 0);
    assert.equal(f.qualifiedPct, 0);
  });
});

describe("within", () => {
  it("keeps only the enquiries that landed inside the window", () => {
    const leads = [
      { createdAt: new Date(NOW.getTime() - 5 * DAY) },
      { createdAt: new Date(NOW.getTime() - 45 * DAY) },
      { createdAt: new Date(NOW.getTime() - 200 * DAY) },
    ];
    assert.equal(within(leads, 30, NOW).length, 1);
    assert.equal(within(leads, 90, NOW).length, 2);
  });

  it("keeps everything when there is no window", () => {
    const leads = [{ createdAt: new Date("2020-01-01T00:00:00Z") }];
    assert.equal(within(leads, null, NOW).length, 1);
  });
});
