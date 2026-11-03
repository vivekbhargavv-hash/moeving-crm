import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDeploymentGrid } from "@/lib/deployment-grid";
import {
  committed,
  isClosedOut,
  planDrop,
  stillToGo,
} from "@/lib/deployment-progress";
import { dealId, deploymentId, leadId } from "@/lib/record-ids";

/**
 * Dropped vehicles (Vivek, 3 Nov): 7 sold, 4 went out, demand for 3 went
 * away. The deal stays sold at 7; the 3 are dropped with a reason, and the
 * deal leaves the queue because nothing is owed any more.
 */
const deal = (fleetSize: number, vehiclesDeployed: number, vehiclesDropped = 0) => ({
  fleetSize,
  vehiclesDeployed,
  vehiclesDropped,
});

describe("stillToGo / isClosedOut", () => {
  it("counts sold minus out minus dropped", () => {
    assert.equal(stillToGo(deal(7, 4)), 3);
    assert.equal(stillToGo(deal(7, 4, 2)), 1);
    assert.equal(isClosedOut(deal(7, 4, 2)), false);
  });

  it("closes the deal when out + dropped covers the fleet", () => {
    assert.equal(stillToGo(deal(7, 4, 3)), 0);
    assert.equal(isClosedOut(deal(7, 4, 3)), true);
  });

  it("never goes negative after a fleet is cut", () => {
    assert.equal(stillToGo(deal(3, 4, 1)), 0);
  });

  it("treats a row without a dropped count as none dropped", () => {
    assert.equal(stillToGo({ fleetSize: 5, vehiclesDeployed: 2 }), 3);
  });

  it("commits only the vehicles that are actually coming", () => {
    assert.equal(committed(deal(7, 4, 3)), 4);
  });
});

describe("planDrop", () => {
  it("drops part of what is left, adding to anything dropped before", () => {
    const r = planDrop(deal(7, 4, 1), { vehicles: 2, reason: "demand_lost", note: null });
    assert.deepEqual(r, { ok: true, vehiclesDropped: 3 });
  });

  it("refuses more than is still to go — a truck on the road is not dropped", () => {
    const r = planDrop(deal(7, 4), { vehicles: 4, reason: "demand_lost", note: null });
    assert.equal(r.ok, false);
  });

  it("refuses zero, fractions and a deal with nothing left", () => {
    assert.equal(planDrop(deal(7, 4), { vehicles: 0, reason: "demand_lost", note: null }).ok, false);
    assert.equal(planDrop(deal(7, 4), { vehicles: 1.5, reason: "demand_lost", note: null }).ok, false);
    assert.equal(planDrop(deal(7, 7), { vehicles: 1, reason: "demand_lost", note: null }).ok, false);
  });

  it("needs a reason, and Others needs a sentence", () => {
    assert.equal(planDrop(deal(7, 4), { vehicles: 1, reason: null, note: null }).ok, false);
    assert.equal(planDrop(deal(7, 4), { vehicles: 1, reason: "other", note: "  " }).ok, false);
    assert.equal(
      planDrop(deal(7, 4), { vehicles: 1, reason: "other", note: "Site shut" }).ok,
      true,
    );
  });
});

describe("the By month grid with dropped vehicles", () => {
  it("counts only vehicles that are coming, and moves a closed deal to Deployed", () => {
    const row = (fleetSize: number, out: number, dropped: number) => ({
      deploymentDate: "2026-11-10",
      city: "Delhi NCR",
      vehicleType: "1T Tata Ace",
      fleetSize,
      vehiclesDeployed: out,
      vehiclesDropped: dropped,
    });
    const grid = buildDeploymentGrid([row(7, 2, 3), row(7, 4, 3)]);
    assert.equal(grid.total.vehicles, 4); // 7 sold − 3 dropped
    assert.equal(grid.total.remaining, 2);
    assert.equal(grid.deployed.length, 1);
  });
});

describe("record IDs", () => {
  it("prefixes and pads, and grows past four digits", () => {
    assert.equal(leadId(12), "L-0012");
    assert.equal(dealId(45), "D-0045");
    assert.equal(deploymentId(31), "DP-0031");
    assert.equal(dealId(12345), "D-12345");
  });

  it("leaves a missing link blank rather than inventing one", () => {
    assert.equal(leadId(null), "");
    assert.equal(dealId(undefined), "");
  });
});
