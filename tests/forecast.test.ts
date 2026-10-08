import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dayBefore, forecastColumn, OVERDUE } from "../src/lib/forecast";

const window = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];

describe("forecastColumn", () => {
  it("puts last month's open deal in Overdue, not off the edge", () => {
    assert.equal(forecastColumn("2026-09", window), OVERDUE);
  });

  it("puts a deal that slipped a year ago in Overdue too", () => {
    assert.equal(forecastColumn("2025-11", window), OVERDUE);
  });

  it("keeps this month's deal in this month", () => {
    assert.equal(forecastColumn("2026-10", window), "2026-10");
  });

  it("crosses the year boundary inside the window", () => {
    assert.equal(forecastColumn("2027-01", window), "2027-01");
  });

  it("leaves a deal past the window's end out", () => {
    assert.equal(forecastColumn("2027-04", window), null);
  });

  it("has nowhere to put anything with no window", () => {
    assert.equal(forecastColumn("2026-10", []), null);
  });
});

describe("dayBefore", () => {
  it("is the last day of the previous month", () => {
    assert.equal(dayBefore("2026-10"), "2026-09-30");
  });

  it("crosses into last year in January", () => {
    assert.equal(dayBefore("2027-01"), "2026-12-31");
  });

  it("knows a leap February", () => {
    assert.equal(dayBefore("2028-03"), "2028-02-29");
  });
});
