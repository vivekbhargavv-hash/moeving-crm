import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bucketFollowUps,
  boardState,
  compareByRisk,
  daysBetween,
  dueLabel,
  followUpBucket,
  STALE_DAYS,
  threadOf,
  wayForward,
  type OpenFollowUp,
  type PlannedMeeting,
} from "../src/lib/meetings";

/**
 * The rules leadership reads the Meetings board by.
 *
 * Every status on that screen is computed, never typed, which is the whole
 * point of it — so the cases worth pinning are the ones a screenshot would
 * not show: which of several open commitments becomes "the way forward", when
 * an account is merely quiet and when it is stalled, and that the ball being
 * on the customer's side never reads as us being late.
 */

const TODAY = "2026-11-27";

const followUp = (
  over: Partial<OpenFollowUp> & Pick<OpenFollowUp, "dueOn">,
): OpenFollowUp => ({
  id: "f1",
  description: "Send the Pune proposal",
  side: "us",
  ownerName: "Rohit Menon",
  ownerUserId: "u1",
  meetingId: "m1",
  meetingRef: 42,
  meetingLevel: "leadership",
  accountId: "a1",
  accountName: "DMart",
  ...over,
});

const planned = (metOn: string): PlannedMeeting => ({
  id: "m9",
  ref: 51,
  title: "CEO call",
  metOn,
  ownerName: "Vivek Bhargav",
  level: "leadership",
});

describe("wayForward", () => {
  it("is the earliest dated commitment", () => {
    const next = wayForward(
      [
        followUp({ dueOn: "2026-12-09", description: "Hold the rate" }),
        followUp({ dueOn: "2026-12-01", description: "Driver retraining" }),
      ],
      [],
      TODAY,
    );
    assert.equal(next?.kind, "follow_up");
    assert.equal(
      next?.kind === "follow_up" ? next.followUp.description : null,
      "Driver retraining",
    );
  });

  it("falls back to the next planned meeting when nothing is owed", () => {
    const next = wayForward([], [planned("2026-12-09")], TODAY);
    assert.equal(next?.kind, "meeting");
    assert.equal(next?.kind === "meeting" ? next.inDays : null, 12);
  });

  it("prefers a commitment over a meeting on the same day", () => {
    const next = wayForward(
      [followUp({ dueOn: "2026-12-09" })],
      [planned("2026-12-09")],
      TODAY,
    );
    assert.equal(next?.kind, "follow_up");
  });

  it("is nothing when there is nothing open and nothing planned", () => {
    assert.equal(wayForward([], [], TODAY), null);
  });

  it("ignores a planned meeting that is further out than a commitment", () => {
    const next = wayForward(
      [followUp({ dueOn: "2026-11-30" })],
      [planned("2026-12-20")],
      TODAY,
    );
    assert.equal(next?.kind, "follow_up");
  });
});

describe("boardState", () => {
  it("is waiting on us when our commitment is next, and late once its date has passed", () => {
    const state = boardState({
      lastHeldOn: "2026-11-12",
      open: [followUp({ dueOn: "2026-11-18" })],
      planned: [],
      today: TODAY,
    });
    assert.equal(state.status, "waiting_on_us");
    assert.equal(state.late, true);
    assert.equal(state.daysLate, 9);
  });

  it("is waiting on us but not late when the date is still ahead", () => {
    const state = boardState({
      lastHeldOn: "2026-11-24",
      open: [followUp({ dueOn: "2026-12-01" })],
      planned: [],
      today: TODAY,
    });
    assert.equal(state.status, "waiting_on_us");
    assert.equal(state.late, false);
    assert.equal(state.daysLate, 0);
  });

  it("is with the customer when the next commitment is theirs", () => {
    const state = boardState({
      lastHeldOn: "2026-11-18",
      open: [
        followUp({
          dueOn: "2026-12-05",
          side: "customer",
          ownerUserId: null,
          ownerName: "Anand Krishnan, CSCO",
        }),
      ],
      planned: [planned("2026-12-09")],
      today: TODAY,
    });
    assert.equal(state.status, "with_customer");
    // What they owe us must never read as us being late.
    assert.equal(state.late, false);
  });

  it("is on track when nothing is owed and a meeting is in the diary", () => {
    const state = boardState({
      lastHeldOn: "2026-11-25",
      open: [],
      planned: [planned("2026-12-09")],
      today: TODAY,
    });
    assert.equal(state.status, "on_track");
  });

  it("says no next step when the account was seen recently but nothing was agreed", () => {
    const state = boardState({
      lastHeldOn: "2026-11-20",
      open: [],
      planned: [],
      today: TODAY,
    });
    assert.equal(state.status, "no_next_step");
    assert.equal(state.daysSinceLastMeeting, 7);
  });

  it("is stalled once nothing is agreed and nobody has been there in STALE_DAYS", () => {
    const state = boardState({
      lastHeldOn: "2026-08-21",
      open: [],
      planned: [],
      today: TODAY,
    });
    assert.equal(state.status, "stalled");
    assert.ok(state.daysSinceLastMeeting! >= STALE_DAYS);
  });

  it("counts a customer never met as stalled, not merely quiet", () => {
    const state = boardState({ lastHeldOn: null, open: [], planned: [], today: TODAY });
    assert.equal(state.status, "stalled");
    assert.equal(state.daysSinceLastMeeting, null);
  });

  it("an open commitment keeps an account off the stalled list even after months of silence", () => {
    const state = boardState({
      lastHeldOn: "2026-06-01",
      open: [followUp({ dueOn: "2026-12-10" })],
      planned: [],
      today: TODAY,
    });
    assert.equal(state.status, "waiting_on_us");
  });

  it("a planned meeting whose date has passed stops counting as the way forward", () => {
    // The queries only pass planned meetings dated today or later, which is
    // what turns a forgotten write-up into a visible "no next step".
    const state = boardState({
      lastHeldOn: "2026-11-20",
      open: [],
      planned: [],
      today: TODAY,
    });
    assert.equal(state.wayForward, null);
  });
});

describe("compareByRisk", () => {
  const state = (over: Parameters<typeof boardState>[0]) => boardState(over);

  it("puts the problems above the accounts that are fine", () => {
    const rows = [
      {
        name: "Delhivery",
        state: state({
          lastHeldOn: "2026-11-25",
          open: [],
          planned: [planned("2026-12-09")],
          today: TODAY,
        }),
      },
      {
        name: "Udaan",
        state: state({ lastHeldOn: "2026-08-21", open: [], planned: [], today: TODAY }),
      },
      {
        name: "Zepto",
        state: state({
          lastHeldOn: "2026-11-12",
          open: [followUp({ dueOn: "2026-11-18" })],
          planned: [],
          today: TODAY,
        }),
      },
      {
        name: "Tata 1mg",
        state: state({ lastHeldOn: "2026-11-20", open: [], planned: [], today: TODAY }),
      },
    ];
    assert.deepEqual(
      [...rows].sort(compareByRisk).map((r) => r.name),
      ["Udaan", "Zepto", "Tata 1mg", "Delhivery"],
    );
  });

  it("orders two late accounts by how late they are", () => {
    const rows = [
      {
        name: "Slightly late",
        state: state({
          lastHeldOn: "2026-11-20",
          open: [followUp({ dueOn: "2026-11-26" })],
          planned: [],
          today: TODAY,
        }),
      },
      {
        name: "Very late",
        state: state({
          lastHeldOn: "2026-11-01",
          open: [followUp({ dueOn: "2026-11-05" })],
          planned: [],
          today: TODAY,
        }),
      },
    ];
    assert.deepEqual(
      [...rows].sort(compareByRisk).map((r) => r.name),
      ["Very late", "Slightly late"],
    );
  });
});

describe("follow-up buckets", () => {
  it("splits overdue, this week and later", () => {
    assert.equal(followUpBucket("2026-11-26", TODAY), "overdue");
    assert.equal(followUpBucket(TODAY, TODAY), "this_week");
    assert.equal(followUpBucket("2026-12-04", TODAY), "this_week");
    assert.equal(followUpBucket("2026-12-05", TODAY), "later");
  });

  it("groups in order and drops the empty buckets", () => {
    const groups = bucketFollowUps(
      [{ dueOn: "2026-12-20" }, { dueOn: "2026-11-10" }, { dueOn: "2026-11-01" }],
      TODAY,
    );
    assert.deepEqual(
      groups.map((g) => g.bucket),
      ["overdue", "later"],
    );
    // Oldest first inside a bucket: the thing most overdue is read first.
    assert.deepEqual(
      groups[0]!.items.map((i) => i.dueOn),
      ["2026-11-01", "2026-11-10"],
    );
  });
});

describe("dueLabel", () => {
  it("reads as a person would say it", () => {
    assert.equal(dueLabel(TODAY, TODAY), "due today");
    assert.equal(dueLabel("2026-11-28", TODAY), "due tomorrow");
    assert.equal(dueLabel("2026-11-26", TODAY), "1 day late");
    assert.equal(dueLabel("2026-11-18", TODAY), "9 days late");
    assert.equal(dueLabel("2026-12-01", TODAY), "in 4 days");
  });
});

describe("threadOf", () => {
  const m = (id: string, metOn: string, parentMeetingId: string | null = null) => ({
    id,
    metOn,
    parentMeetingId,
  });

  it("nests follow-up meetings under the one they came from, newest thread first", () => {
    const groups = threadOf([
      m("a", "2026-11-18"),
      m("b", "2026-11-24", "a"),
      m("c", "2026-09-02"),
      m("d", "2026-12-09", "a"),
    ]);
    assert.deepEqual(groups.map((g) => g.meeting.id), ["a", "c"]);
    // Children read forwards, in the order the conversation happened.
    assert.deepEqual(groups[0]!.children.map((c) => c.id), ["b", "d"]);
  });

  it("stands a meeting on its own when its parent is not in the list", () => {
    const groups = threadOf([m("b", "2026-11-24", "missing")]);
    assert.deepEqual(groups.map((g) => g.meeting.id), ["b"]);
  });
});

describe("daysBetween", () => {
  it("counts whole days and goes negative into the past", () => {
    assert.equal(daysBetween("2026-11-20", TODAY), 7);
    assert.equal(daysBetween(TODAY, "2026-11-20"), -7);
    assert.equal(daysBetween(TODAY, TODAY), 0);
    // Across a month end, and a leap day.
    assert.equal(daysBetween("2026-12-28", "2027-01-04"), 7);
    assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2);
  });
});
