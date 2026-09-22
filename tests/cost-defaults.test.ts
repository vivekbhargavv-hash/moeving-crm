import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defaultsFor, driftedFrom, type CostDefault } from "@/lib/cost-defaults";

const ACE = "11111111-1111-4111-8111-111111111111";
const EICHER = "22222222-2222-4222-8222-222222222222";

/** The rules as the business states them. */
const rows: CostDefault[] = [
  { costKey: "leaseCost", vehicleTypeId: ACE, chargingScope: null, operatingDays: null, amount: 22000 },
  { costKey: "leaseCost", vehicleTypeId: EICHER, chargingScope: null, operatingDays: null, amount: 31000 },
  { costKey: "driverCost", vehicleTypeId: null, chargingScope: null, operatingDays: 26, amount: 21000 },
  { costKey: "driverCost", vehicleTypeId: null, chargingScope: null, operatingDays: 30, amount: 24000 },
  { costKey: "chargingCost", vehicleTypeId: ACE, chargingScope: "moeving", operatingDays: null, amount: 5000 },
  { costKey: "chargingCost", vehicleTypeId: ACE, chargingScope: "client", operatingDays: null, amount: 0 },
  { costKey: "chargingCost", vehicleTypeId: EICHER, chargingScope: "moeving", operatingDays: null, amount: 7000 },
  { costKey: "chargingCost", vehicleTypeId: EICHER, chargingScope: "client", operatingDays: null, amount: 0 },
  { costKey: "parkingCost", vehicleTypeId: null, chargingScope: "moeving", operatingDays: null, amount: 1500 },
  { costKey: "parkingCost", vehicleTypeId: null, chargingScope: "client", operatingDays: null, amount: 0 },
  { costKey: "maintenanceCost", vehicleTypeId: null, chargingScope: null, operatingDays: null, amount: 2000 },
  { costKey: "supervisorCost", vehicleTypeId: null, chargingScope: null, operatingDays: null, amount: 2000 },
  { costKey: "miscCost", vehicleTypeId: null, chargingScope: null, operatingDays: null, amount: 0 },
];

describe("defaultsFor", () => {
  it("costs a fully answered deal from the rules", () => {
    const out = defaultsFor(
      { vehicleTypeId: ACE, chargingScope: "moeving", operatingDays: 26 },
      rows,
    );
    assert.deepEqual(out, {
      leaseCost: 22000,
      driverCost: 21000,
      chargingCost: 5000,
      parkingCost: 1500,
      maintenanceCost: 2000,
      supervisorCost: 2000,
      miscCost: 0,
    });
  });

  it("charges nothing when the client pays for charging", () => {
    const out = defaultsFor(
      { vehicleTypeId: EICHER, chargingScope: "client", operatingDays: 30 },
      rows,
    );
    assert.equal(out.chargingCost, 0);
    assert.equal(out.parkingCost, 0);
    // The vehicle still drives the lease, and the days still drive the driver.
    assert.equal(out.leaseCost, 31000);
    assert.equal(out.driverCost, 24000);
  });

  it("varies the driver by the days and nothing else", () => {
    const short = defaultsFor(
      { vehicleTypeId: ACE, chargingScope: "moeving", operatingDays: 26 },
      rows,
    );
    const long = defaultsFor(
      { vehicleTypeId: ACE, chargingScope: "moeving", operatingDays: 30 },
      rows,
    );
    assert.equal(short.driverCost, 21000);
    assert.equal(long.driverCost, 24000);
    assert.equal(short.leaseCost, long.leaseCost);
  });

  it("leaves a line alone when the deal cannot answer what it varies by", () => {
    const out = defaultsFor(
      { vehicleTypeId: null, chargingScope: "moeving", operatingDays: null },
      rows,
    );
    // No vehicle type and no days: lease, charging and driver have nothing to
    // key off. Zero would be a claim that they are free.
    assert.equal("leaseCost" in out, false);
    assert.equal("chargingCost" in out, false);
    assert.equal("driverCost" in out, false);
    // Parking only needs the scope, and the flat lines never needed anything.
    assert.equal(out.parkingCost, 1500);
    assert.equal(out.maintenanceCost, 2000);
  });

  it("leaves a line alone when the admin has not set it", () => {
    const out = defaultsFor(
      { vehicleTypeId: "33333333-3333-4333-8333-333333333333", chargingScope: "moeving", operatingDays: 26 },
      rows,
    );
    assert.equal("leaseCost" in out, false);
    assert.equal("chargingCost" in out, false);
    assert.equal(out.driverCost, 21000);
  });

  it("ignores a row carrying a dimension its cost line does not use", () => {
    const stale: CostDefault[] = [
      // A lease row that also pins a charging scope — left over from a rule
      // that no longer exists. Lease varies by vehicle only, so this is not it.
      { costKey: "leaseCost", vehicleTypeId: ACE, chargingScope: "client", operatingDays: null, amount: 999 },
    ];
    const out = defaultsFor(
      { vehicleTypeId: ACE, chargingScope: "client", operatingDays: 26 },
      stale,
    );
    assert.equal("leaseCost" in out, false);
  });

  it("keeps a real zero, which is not the same as no answer", () => {
    const out = defaultsFor(
      { vehicleTypeId: ACE, chargingScope: "client", operatingDays: 26 },
      rows,
    );
    assert.equal(out.chargingCost, 0);
    assert.equal("chargingCost" in out, true);
  });
});

describe("driftedFrom", () => {
  const defaults = { leaseCost: 22000, driverCost: 21000, miscCost: 0 };

  it("names the figures that no longer match", () => {
    assert.deepEqual(
      driftedFrom({ leaseCost: 19000, driverCost: 21000 }, defaults),
      ["leaseCost"],
    );
  });

  it("says nothing about a figure that was never filled in", () => {
    assert.deepEqual(driftedFrom({ leaseCost: null }, defaults), []);
  });

  it("says nothing when there is no default to compare against", () => {
    assert.deepEqual(driftedFrom({ parkingCost: 4000 }, defaults), []);
  });

  it("counts a stored zero against a non-zero default", () => {
    assert.deepEqual(driftedFrom({ driverCost: 0 }, defaults), ["driverCost"]);
  });
});
