import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lastSeenLabel, shouldRecordSeen } from "@/lib/last-seen";

const NOW = new Date("2026-09-22T10:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("shouldRecordSeen", () => {
  it("writes for someone who has never been seen", () => {
    assert.equal(shouldRecordSeen(null, NOW), true);
    assert.equal(shouldRecordSeen(undefined, NOW), true);
  });

  it("skips the write inside the throttle window", () => {
    assert.equal(shouldRecordSeen(ago(0), NOW), false);
    assert.equal(shouldRecordSeen(ago(4 * MIN), NOW), false);
  });

  it("writes once the window has passed", () => {
    assert.equal(shouldRecordSeen(ago(5 * MIN), NOW), true);
    assert.equal(shouldRecordSeen(ago(3 * DAY), NOW), true);
  });

  it("writes when the stored time is in the future", () => {
    // A clock disagreeing between the database and the app server must not
    // freeze the column for however long the skew lasts.
    assert.equal(shouldRecordSeen(new Date(NOW.getTime() + HOUR), NOW), true);
  });
});

describe("lastSeenLabel", () => {
  it("has nothing to say about someone never seen", () => {
    assert.equal(lastSeenLabel(null, NOW), null);
    assert.equal(lastSeenLabel("not a date", NOW), null);
  });

  it("keeps the month's capital while relative forms stay lower case", () => {
    // "Seen " + label is one phrase; lower-casing the lot gave "13 aug 2026".
    assert.equal(lastSeenLabel(ago(2 * HOUR), NOW), "2 hours ago");
    assert.equal(lastSeenLabel(new Date("2026-08-13T09:00:00Z"), NOW), "13 Aug 2026");
  });

  it("reads as just now for the last minute and a half", () => {
    assert.equal(lastSeenLabel(ago(0), NOW), "just now");
    assert.equal(lastSeenLabel(ago(80 * 1000), NOW), "just now");
    // Small clock skew reads as now, never as the future.
    assert.equal(lastSeenLabel(new Date(NOW.getTime() + 20_000), NOW), "just now");
  });

  it("counts minutes, then hours, then days", () => {
    assert.equal(lastSeenLabel(ago(14 * MIN), NOW), "14 min ago");
    assert.equal(lastSeenLabel(ago(2 * HOUR), NOW), "2 hours ago");
    assert.equal(lastSeenLabel(ago(1 * HOUR), NOW), "1 hour ago");
    assert.equal(lastSeenLabel(ago(3 * DAY), NOW), "3 days ago");
    assert.equal(lastSeenLabel(ago(1 * DAY), NOW), "1 day ago");
  });

  it("gives the date itself once a week has passed", () => {
    // Past a week "9 days ago" is arithmetic the reader has to undo.
    assert.equal(lastSeenLabel(new Date("2026-09-01T09:00:00Z"), NOW), "1 Sep 2026");
  });

  it("dates in India, not UTC", () => {
    // 20:00 UTC is already the next morning in Kolkata, and this team is.
    assert.equal(lastSeenLabel(new Date("2026-08-31T20:00:00Z"), NOW), "1 Sep 2026");
  });
});
