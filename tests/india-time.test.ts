import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDateTimeInIndia, todayInIndia } from "@/lib/utils";

describe("todayInIndia", () => {
  it("is already tomorrow in India while UTC is still on today", () => {
    // 20:00 UTC on the 22nd is 01:30 IST on the 23rd.
    assert.equal(todayInIndia(new Date("2026-09-22T20:00:00Z")), "2026-09-23");
  });

  it("agrees with UTC in the middle of the Indian day", () => {
    assert.equal(todayInIndia(new Date("2026-09-22T06:00:00Z")), "2026-09-22");
  });
});

describe("formatDateTimeInIndia", () => {
  it("reads the clock in India, not on the server", () => {
    // 03:40 UTC is 09:10 IST.
    const label = formatDateTimeInIndia("2026-09-22T03:40:00Z");
    assert.match(label, /9:10/);
    assert.match(label, /22/);
  });
});
