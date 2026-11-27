import type { FollowUpStatus, MeetingKind, MeetingLevel, MeetingStatus } from "@/db/schema";

/**
 * What the Meetings board says about an account, worked out from the rows
 * rather than typed by anyone.
 *
 * The whole module rests on one idea: an account's state is a function of its
 * open commitments and their dates. Nobody can mark a customer green by hand,
 * and an account with nothing owed either way cannot hide — it says so.
 *
 * Pure functions on purpose: these are the rules leadership reads a screen by,
 * so they are tested (tests/meetings.test.ts) rather than inspected.
 */

/* --------------------------------------------------------------- vocabulary */

export const MEETING_LEVELS: {
  value: MeetingLevel;
  label: string;
  /** What it means, under the control that chooses it. */
  hint: string;
  chip: string;
}[] = [
  {
    value: "leadership",
    label: "Leadership",
    hint: "A CXO conversation",
    chip: "bg-indigo-50 text-indigo-800",
  },
  {
    value: "regional",
    label: "Regional",
    hint: "The deal owner, in a city",
    chip: "bg-slate-100 text-slate-700",
  },
  {
    value: "operational",
    label: "Operational",
    hint: "The people who run the fleet",
    chip: "bg-slate-100 text-slate-600",
  },
];

export const LEVEL_LABEL: Record<MeetingLevel, string> = {
  leadership: "Leadership",
  regional: "Regional",
  operational: "Operational",
};

export const LEVEL_CHIP: Record<MeetingLevel, string> = {
  leadership: "bg-indigo-50 text-indigo-800",
  regional: "bg-slate-100 text-slate-700",
  operational: "bg-slate-100 text-slate-600",
};

export const MEETING_KINDS: { value: MeetingKind; label: string }[] = [
  { value: "in_person", label: "In person" },
  { value: "call", label: "Call" },
  { value: "video", label: "Video" },
];

export const KIND_LABEL: Record<MeetingKind, string> = {
  in_person: "In person",
  call: "Call",
  video: "Video",
};

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  planned: "Planned",
  held: "Held",
  cancelled: "Cancelled",
};

export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = {
  open: "Open",
  done: "Done",
  dropped: "Dropped",
};

/**
 * How long an account may go without a meeting before the board calls it
 * stalled rather than merely quiet. Two months: a strategic customer nobody
 * has spoken to since the last quarter is the thing this screen exists to
 * surface.
 */
export const STALE_DAYS = 60;

/** A follow-up due within this many days counts as "this week". */
const SOON_DAYS = 7;

/* -------------------------------------------------------------- date helpers */

const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Whole days from `from` to `to`, both YYYY-MM-DD. Negative is the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/* ------------------------------------------------------------------- shapes */

export type OpenFollowUp = {
  id: string;
  description: string;
  dueOn: string;
  /** Who owes it: one of our people, or someone at the customer. */
  side: "us" | "customer";
  ownerName: string;
  ownerUserId: string | null;
  meetingId: string;
  meetingRef: number;
  meetingLevel: MeetingLevel;
  accountId: string;
  accountName: string;
};

export type PlannedMeeting = {
  id: string;
  ref: number;
  title: string;
  metOn: string;
  ownerName: string;
  level: MeetingLevel;
};

/**
 * The single next thing that has to happen on an account — the line the board
 * shows under "Way forward".
 *
 * It is whichever dated thing comes first: an open commitment, or a meeting
 * already in the diary. A commitment wins a tie, because a date in the diary
 * with a promise due the same day is still about the promise.
 */
export type WayForward =
  | { kind: "follow_up"; followUp: OpenFollowUp; daysLate: number }
  | { kind: "meeting"; meeting: PlannedMeeting; inDays: number }
  | null;

export function wayForward(
  open: OpenFollowUp[],
  planned: PlannedMeeting[],
  today: string,
): WayForward {
  const next = [...open].sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))[0];
  const meeting = [...planned].sort((a, b) =>
    a.metOn < b.metOn ? -1 : a.metOn > b.metOn ? 1 : 0,
  )[0];

  if (next && (!meeting || next.dueOn <= meeting.metOn)) {
    return { kind: "follow_up", followUp: next, daysLate: daysBetween(next.dueOn, today) };
  }
  if (meeting) {
    return { kind: "meeting", meeting, inDays: daysBetween(today, meeting.metOn) };
  }
  return null;
}

/* ------------------------------------------------------------------- status */

export type BoardStatus =
  /** Our commitment is overdue, or it is the next thing due. */
  | "waiting_on_us"
  /** The ball is on their side. */
  | "with_customer"
  /** Nothing owed; a meeting is in the diary. */
  | "on_track"
  /** Seen recently, but the last meeting closed without a next step. */
  | "no_next_step"
  /** Nothing owed, nothing planned, and nobody has been there in STALE_DAYS. */
  | "stalled";

export const STATUS_META: Record<
  BoardStatus,
  { label: string; chip: string; stripe: string; explain: string }
> = {
  waiting_on_us: {
    label: "Waiting on us",
    chip: "bg-amber-50 text-amber-900",
    stripe: "bg-amber-400",
    explain: "Our follow-up is the next thing due",
  },
  with_customer: {
    label: "With customer",
    chip: "bg-sky-50 text-sky-800",
    stripe: "bg-sky-400",
    explain: "The ball is on their side",
  },
  on_track: {
    label: "On track",
    chip: "bg-brand-soft text-brand-ink",
    stripe: "bg-brand",
    explain: "Nothing owed and a meeting in the diary",
  },
  no_next_step: {
    label: "No next step",
    chip: "bg-amber-50 text-amber-900",
    stripe: "bg-amber-400",
    explain: "The last meeting closed without one",
  },
  stalled: {
    label: "Stalled",
    chip: "bg-rose-50 text-rose-700",
    stripe: "bg-rose-500",
    explain: `No next step and nobody there in ${STALE_DAYS} days`,
  },
};

export type BoardState = {
  status: BoardStatus;
  /** True when the way forward is a date that has already passed. */
  late: boolean;
  /** Days past due; 0 when not late. */
  daysLate: number;
  wayForward: WayForward;
  /** Null when we have never met them. */
  daysSinceLastMeeting: number | null;
};

export function boardState(input: {
  /** The most recent HELD meeting, YYYY-MM-DD, or null. */
  lastHeldOn: string | null;
  open: OpenFollowUp[];
  planned: PlannedMeeting[];
  today: string;
}): BoardState {
  const { lastHeldOn, open, planned, today } = input;
  const since = lastHeldOn ? daysBetween(lastHeldOn, today) : null;
  const next = wayForward(open, planned, today);

  if (!next) {
    return {
      status: since !== null && since < STALE_DAYS ? "no_next_step" : "stalled",
      late: false,
      daysLate: 0,
      wayForward: null,
      daysSinceLastMeeting: since,
    };
  }

  if (next.kind === "meeting") {
    return {
      status: "on_track",
      late: next.inDays < 0,
      daysLate: next.inDays < 0 ? -next.inDays : 0,
      wayForward: next,
      daysSinceLastMeeting: since,
    };
  }

  return {
    status: next.followUp.side === "us" ? "waiting_on_us" : "with_customer",
    late: next.daysLate > 0,
    daysLate: Math.max(0, next.daysLate),
    wayForward: next,
    daysSinceLastMeeting: since,
  };
}

/**
 * The order the board puts accounts in: what is at risk first, alphabetical
 * last. Leadership opens this screen to find the problems, not to look
 * something up — that is what Customers is for.
 */
export function riskRank(state: BoardState): number {
  if (state.status === "stalled") return 0;
  if (state.status === "waiting_on_us") return state.late ? 1 : 3;
  if (state.status === "no_next_step") return 2;
  if (state.status === "with_customer") return state.late ? 4 : 5;
  return 6;
}

export function compareByRisk(
  a: { state: BoardState; name: string },
  b: { state: BoardState; name: string },
): number {
  const rank = riskRank(a.state) - riskRank(b.state);
  if (rank !== 0) return rank;
  if (a.state.daysLate !== b.state.daysLate) return b.state.daysLate - a.state.daysLate;
  const aSince = a.state.daysSinceLastMeeting ?? Number.MAX_SAFE_INTEGER;
  const bSince = b.state.daysSinceLastMeeting ?? Number.MAX_SAFE_INTEGER;
  if (aSince !== bSince) return bSince - aSince;
  return a.name.localeCompare(b.name);
}

/* --------------------------------------------------------------- follow-ups */

export type FollowUpBucket = "overdue" | "this_week" | "later";

export const BUCKET_LABEL: Record<FollowUpBucket, string> = {
  overdue: "Overdue",
  this_week: "This week",
  later: "Later",
};

export function followUpBucket(dueOn: string, today: string): FollowUpBucket {
  const days = daysBetween(today, dueOn);
  if (days < 0) return "overdue";
  return days <= SOON_DAYS ? "this_week" : "later";
}

/** The three buckets in order, each with its follow-ups sorted by date. */
export function bucketFollowUps<T extends { dueOn: string }>(items: T[], today: string) {
  const order: FollowUpBucket[] = ["overdue", "this_week", "later"];
  const sorted = [...items].sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
  return order
    .map((bucket) => ({
      bucket,
      items: sorted.filter((i) => followUpBucket(i.dueOn, today) === bucket),
    }))
    .filter((g) => g.items.length > 0);
}

/** "9 days late", "due today", "in 4 days" — how a date reads in a list. */
export function dueLabel(dueOn: string, today: string): string {
  const days = daysBetween(today, dueOn);
  if (days === 0) return "due today";
  if (days < 0) return `${-days} ${days === -1 ? "day" : "days"} late`;
  if (days === 1) return "due tomorrow";
  return `in ${days} days`;
}

/* ------------------------------------------------------------------ threads */

/**
 * A meeting and the meetings that came out of it, newest first.
 *
 * A follow-up whose parent is not in the same list stands on its own rather
 * than disappearing — the same rule the Customers page uses for expansions,
 * so a filtered view never silently hides a meeting.
 */
export function threadOf<T extends { id: string; parentMeetingId: string | null; metOn: string }>(
  meetings: T[],
): { meeting: T; children: T[] }[] {
  const ids = new Set(meetings.map((m) => m.id));
  const newestFirst = (a: T, b: T) => (a.metOn < b.metOn ? 1 : a.metOn > b.metOn ? -1 : 0);
  return meetings
    .filter((m) => !m.parentMeetingId || !ids.has(m.parentMeetingId))
    .sort(newestFirst)
    .map((meeting) => ({
      meeting,
      children: meetings
        .filter((m) => m.parentMeetingId === meeting.id)
        .sort((a, b) => -newestFirst(a, b)),
    }));
}
