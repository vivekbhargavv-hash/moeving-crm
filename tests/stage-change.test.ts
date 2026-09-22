import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  missingEconomics,
  planStageChange,
  unitEconomicsSchema,
} from "@/server/stage-change";

const REASON = "3f1c0a6e-8f1d-4d2b-9a3e-0b7c5d2e1f44";

/** A full Closed Won sheet, as the form posts it: strings. */
const wonSheet = {
  deploymentDate: "2026-11-18",
  revenue: "48000",
  leaseCost: "18000",
  driverCost: "16000",
  chargingCost: "6000",
  parkingCost: "1500",
  maintenanceCost: "2000",
  supervisorCost: "1200",
  miscCost: "300",
};

describe("planStageChange", () => {
  it("does nothing when the deal is already in that stage", () => {
    const plan = planStageChange({ from: "proposal", to: "proposal" });
    assert.equal(plan.type, "noop");
  });

  it("moves an open deal with no questions asked", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    const plan = planStageChange({
      from: "first_contact",
      to: "negotiation",
      now,
    });
    assert.equal(plan.type, "move");
    if (plan.type !== "move") return;
    assert.equal(plan.patch.stage, "negotiation");
    assert.equal(plan.patch.closedAt, null);
    assert.equal(plan.patch.updatedAt, now);
    assert.equal(plan.lostReason, null);
  });

  it("asks for the cost sheet instead of half-closing a won deal", () => {
    for (const fields of [
      undefined,
      {},
      { ...wonSheet, miscCost: null }, // one field short
      { ...wonSheet, revenue: "" },
      { ...wonSheet, deploymentDate: null }, // ops would have no date
      { ...wonSheet, deploymentDate: "November" },
      { ...wonSheet, deploymentDate: "2026-11" }, // a month is no longer enough
      { ...wonSheet, deploymentDate: "2026-02-31" }, // not a real day
      { ...wonSheet, deploymentDate: "2026-13-01" },
      { ...wonSheet, driverCost: "-1" }, // costs are never negative
      { ...wonSheet, leaseCost: "1800.5" }, // whole rupees only
    ]) {
      const plan = planStageChange({
        from: "negotiation",
        to: "closed_won",
        fields: fields as Record<string, unknown> | undefined,
      });
      assert.equal(plan.type, "needs", `expected a prompt for ${JSON.stringify(fields)}`);
      if (plan.type === "needs") assert.equal(plan.needs, "won");
    }
  });

  it("closes a won deal with the whole sheet and a close date", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    const plan = planStageChange({
      from: "negotiation",
      to: "closed_won",
      fields: wonSheet,
      now,
    });
    assert.equal(plan.type, "move");
    if (plan.type !== "move") return;
    assert.equal(plan.patch.closedAt, now);
    // Coerced to whole-rupee integers, not left as form strings.
    assert.equal(plan.patch.revenue, 48000);
    assert.equal(plan.patch.miscCost, 300);
    // The day the owner picked, kept exactly — not rounded to a month end.
    assert.equal(plan.patch.deploymentDate, "2026-11-18");
    const { deploymentDate: _, ...costs } = wonSheet;
    for (const key of Object.keys(costs)) {
      assert.equal(
        typeof plan.patch[key as keyof typeof costs],
        "number",
        `${key} should be a number`,
      );
    }
  });

  it("carries no deployment date into any stage but won", () => {
    for (const to of ["negotiation", "dormant", "closed_lost"] as const) {
      const plan = planStageChange({
        from: "proposal",
        to,
        fields: to === "closed_lost" ? { lostReasonId: REASON } : wonSheet,
      });
      if (plan.type !== "move") continue;
      assert.equal(plan.patch.deploymentDate, undefined);
    }
  });

  it("asks for a reason instead of closing a deal lost without one", () => {
    for (const fields of [undefined, {}, { lostReasonId: "" }, { lostReasonId: "nope" }]) {
      const plan = planStageChange({
        from: "proposal",
        to: "closed_lost",
        fields: fields as Record<string, unknown> | undefined,
      });
      assert.equal(plan.type, "needs", `expected a prompt for ${JSON.stringify(fields)}`);
      if (plan.type === "needs") assert.equal(plan.needs, "lost");
    }
  });

  it("closes a deal lost with a reason, trimming an optional note", () => {
    const plan = planStageChange({
      from: "proposal",
      to: "closed_lost",
      fields: { lostReasonId: REASON, lostReasonNote: "  went with the incumbent  " },
    });
    assert.equal(plan.type, "move");
    if (plan.type !== "move") return;
    assert.deepEqual(plan.lostReason, {
      id: REASON,
      note: "went with the incumbent",
    });
    // The reason is not written into the patch here — the action checks it
    // against the caller's organization first.
    assert.equal("lostReasonId" in plan.patch, false);
  });

  it("carries a missing note through as null, not undefined", () => {
    const plan = planStageChange({
      from: "proposal",
      to: "closed_lost",
      fields: { lostReasonId: REASON },
    });
    assert.equal(plan.type, "move");
    if (plan.type !== "move") return;
    assert.equal(plan.lostReason?.note, null);
  });

  it("clears the close date when a closed deal is reopened", () => {
    for (const from of ["closed_won", "closed_lost"] as const) {
      const plan = planStageChange({ from, to: "negotiation" });
      assert.equal(plan.type, "move");
      if (plan.type !== "move") continue;
      assert.equal(plan.patch.closedAt, null);
    }
  });

  it("does not attach a cost sheet to a move into Dormant", () => {
    const plan = planStageChange({
      from: "negotiation",
      to: "dormant",
      fields: wonSheet,
    });
    assert.equal(plan.type, "move");
    if (plan.type !== "move") return;
    assert.equal(plan.patch.closedAt, null);
    assert.equal("revenue" in plan.patch, false);
  });
});

/** The eight figures as a costed-but-open deal carries them: numbers. */
const storedSheet = {
  revenue: 48000,
  leaseCost: 18000,
  driverCost: 16000,
  chargingCost: 6000,
  parkingCost: 1500,
  maintenanceCost: 2000,
  supervisorCost: 1200,
  miscCost: 300,
};

describe("unit economics saved before the win", () => {
  it("closes a deal costed earlier from its stored sheet and a date alone", () => {
    const plan = planStageChange({
      from: "negotiation",
      to: "closed_won",
      fields: { deploymentDate: "2026-11-18" },
      stored: storedSheet,
    });
    assert.equal(plan.type, "move");
    if (plan.type !== "move") return;
    assert.equal(plan.patch.revenue, 48000);
    assert.equal(plan.patch.miscCost, 300);
    assert.equal(plan.patch.deploymentDate, "2026-11-18");
  });

  it("prefers what the Closed Won sheet posts over what was stored", () => {
    const plan = planStageChange({
      from: "negotiation",
      to: "closed_won",
      fields: { ...wonSheet, revenue: "52000" },
      stored: storedSheet,
    });
    assert.equal(plan.type, "move");
    if (plan.type !== "move") return;
    assert.equal(plan.patch.revenue, 52000);
  });

  it("still asks when the stored sheet is only half filled in", () => {
    const plan = planStageChange({
      from: "negotiation",
      to: "closed_won",
      fields: { deploymentDate: "2026-11-18" },
      stored: { ...storedSheet, driverCost: null },
    });
    assert.equal(plan.type, "needs");
  });

  it("does not let a stored sheet close a deal with no deployment date", () => {
    const plan = planStageChange({
      from: "negotiation",
      to: "closed_won",
      stored: storedSheet,
    });
    assert.equal(plan.type, "needs");
  });

  it("names every figure a deal is still missing", () => {
    assert.deepEqual(missingEconomics(storedSheet), []);
    assert.deepEqual(missingEconomics({ ...storedSheet, revenue: null }), [
      "revenue",
    ]);
    assert.deepEqual(missingEconomics({}).length, 8);
  });

  it("keeps a part-filled sheet, and reads a cleared field as cleared", () => {
    const parsed = unitEconomicsSchema.parse({
      revenue: "48000",
      leaseCost: null,
    });
    assert.equal(parsed.revenue, 48000);
    assert.equal(parsed.leaseCost, null);
    assert.equal(parsed.driverCost, undefined);
  });

  it("refuses a figure that is not a number", () => {
    assert.equal(unitEconomicsSchema.safeParse({ revenue: "lots" }).success, false);
  });
});
