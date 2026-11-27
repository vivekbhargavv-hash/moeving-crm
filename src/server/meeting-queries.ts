import "server-only";

import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  accounts,
  cities,
  contacts,
  meetingAttendees,
  meetingFollowUps,
  meetingTopicLinks,
  meetingTopics,
  meetings,
  opportunities,
  users,
} from "@/db/schema";
import type { MeetingKind, MeetingLevel, MeetingStatus } from "@/db/schema";
import { OPEN_STAGES } from "@/lib/constants";
import {
  boardState,
  compareByRisk,
  type BoardState,
  type OpenFollowUp,
  type PlannedMeeting,
} from "@/lib/meetings";
import { todayInIndia } from "@/lib/utils";
import { requireSales, type Session } from "@/server/auth";

/**
 * Reading the meetings module.
 *
 * Who sees what: a deal owner sees every meeting except the ones marked
 * confidential; an admin sees those too. A regional owner must be able to read
 * what the CXO promised, or they cannot follow it up (Vivek, 27 Nov) — so the
 * only thing hidden is what somebody deliberately marked.
 *
 * The board is assembled in TypeScript from four small queries rather than one
 * SQL statement with a subquery per column. There are a couple of dozen
 * strategic accounts, the rules are the ones in `lib/meetings.ts`, and those
 * are tested. One honest query beats a clever one nobody can change later.
 */

/** Meetings this person may read at all. */
const visible = (session: Session) =>
  session.role === "admin"
    ? eq(meetings.organizationId, session.organizationId)
    : and(
        eq(meetings.organizationId, session.organizationId),
        eq(meetings.confidential, false),
      );

export type BoardAccount = {
  accountId: string;
  name: string;
  isStrategic: boolean;
  /** The cities this customer runs in, from its deals. */
  cities: string[];
  soldVehicles: number;
  liveVehicles: number;
  openDeals: number;
  /** Deal owners on this customer, for "whose account is this". */
  owners: string[];
  lastHeld: { id: string; ref: number; metOn: string; level: MeetingLevel; ownerName: string } | null;
  /** Leadership meetings held in the last year — CXO coverage. */
  cxoMeetings: number;
  openFollowUps: number;
  overdueFollowUps: number;
  state: BoardState;
};

export type MeetingBoard = {
  today: string;
  accounts: BoardAccount[];
  /** Totals across the strategic list, for the tiles. */
  summary: {
    strategic: number;
    metThisQuarter: number;
    cxoMeetings: number;
    overdue: number;
    noNextStep: number;
  };
};

/**
 * The leadership view: one row per customer, worst first.
 *
 * `scope` "strategic" is the watchlist an admin curates; "all" is every
 * customer that has ever had a meeting logged, for the times somebody is
 * looking for a conversation they know happened.
 */
export async function getMeetingBoard(
  scope: "strategic" | "all" = "strategic",
): Promise<MeetingBoard> {
  const session = await requireSales();
  const today = todayInIndia();
  const org = session.organizationId;

  const accountRows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      isStrategic: accounts.isStrategic,
      meetingCount: sql<number>`(select count(*)::int from "meetings" where "meetings"."account_id" = "accounts"."id")`,
    })
    .from(accounts)
    .where(eq(accounts.organizationId, org))
    .orderBy(asc(accounts.name));

  const wanted = accountRows.filter((a) =>
    scope === "strategic" ? a.isStrategic : a.isStrategic || Number(a.meetingCount) > 0,
  );
  if (wanted.length === 0) {
    return {
      today,
      accounts: [],
      summary: { strategic: 0, metThisQuarter: 0, cxoMeetings: 0, overdue: 0, noNextStep: 0 },
    };
  }
  const ids = wanted.map((a) => a.id);

  const owner = alias(users, "meeting_owner");
  const [meetingRows, followUpRows, dealRows] = await Promise.all([
    db
      .select({
        id: meetings.id,
        ref: meetings.ref,
        accountId: meetings.accountId,
        metOn: meetings.metOn,
        level: meetings.level,
        status: meetings.status,
        title: meetings.title,
        ownerName: owner.name,
      })
      .from(meetings)
      .innerJoin(owner, eq(owner.id, meetings.ownerUserId))
      .where(and(visible(session), inArray(meetings.accountId, ids)))
      .orderBy(desc(meetings.metOn)),
    openFollowUps(session, ids),
    db
      .select({
        accountId: opportunities.accountId,
        stage: opportunities.stage,
        fleetSize: opportunities.fleetSize,
        deployed: opportunities.vehiclesDeployed,
        city: cities.name,
        ownerName: users.name,
      })
      .from(opportunities)
      .innerJoin(users, eq(users.id, opportunities.ownerUserId))
      .leftJoin(cities, eq(cities.id, opportunities.cityId))
      .where(and(eq(opportunities.organizationId, org), inArray(opportunities.accountId, ids))),
  ]);

  const quarterStart = startOfQuarter(today);

  const rows: BoardAccount[] = wanted.map((account) => {
    const mine = meetingRows.filter((m) => m.accountId === account.id);
    const held = mine.filter((m) => m.status === "held" && m.metOn <= today);
    const planned: PlannedMeeting[] = mine
      .filter((m) => m.status === "planned" && m.metOn >= today)
      .map((m) => ({
        id: m.id,
        ref: m.ref,
        title: m.title,
        metOn: m.metOn,
        ownerName: m.ownerName,
        level: m.level,
      }));
    const open = followUpRows.filter((f) => f.accountId === account.id);
    const deals = dealRows.filter((d) => d.accountId === account.id);
    const won = deals.filter((d) => d.stage === "closed_won");

    const last = held[0] ?? null;
    const state = boardState({
      lastHeldOn: last?.metOn ?? null,
      open,
      planned,
      today,
    });

    return {
      accountId: account.id,
      name: account.name,
      isStrategic: account.isStrategic,
      cities: unique(deals.map((d) => d.city).filter((c): c is string => Boolean(c))),
      soldVehicles: won.reduce((s, d) => s + d.fleetSize, 0),
      liveVehicles: won.reduce((s, d) => s + Math.min(d.fleetSize, d.deployed), 0),
      openDeals: deals.filter((d) => OPEN_STAGES.includes(d.stage)).length,
      owners: unique(deals.map((d) => d.ownerName)),
      lastHeld: last
        ? {
            id: last.id,
            ref: last.ref,
            metOn: last.metOn,
            level: last.level,
            ownerName: last.ownerName,
          }
        : null,
      cxoMeetings: held.filter(
        (m) => m.level === "leadership" && m.metOn >= aYearBefore(today),
      ).length,
      openFollowUps: open.length,
      overdueFollowUps: open.filter((f) => f.dueOn < today).length,
      state,
    };
  });

  rows.sort((a, b) => compareByRisk({ state: a.state, name: a.name }, { state: b.state, name: b.name }));

  return {
    today,
    accounts: rows,
    summary: {
      strategic: rows.length,
      metThisQuarter: rows.filter(
        (r) => r.lastHeld !== null && r.lastHeld.metOn >= quarterStart,
      ).length,
      cxoMeetings: meetingRows.filter(
        (m) => m.status === "held" && m.level === "leadership" && m.metOn >= quarterStart,
      ).length,
      overdue: rows.reduce((s, r) => s + r.overdueFollowUps, 0),
      noNextStep: rows.filter(
        (r) => r.state.status === "no_next_step" || r.state.status === "stalled",
      ).length,
    },
  };
}

/** Every open follow-up this person may see, optionally for some accounts. */
async function openFollowUps(
  session: Session,
  accountIds?: string[],
  ownerUserId?: string,
): Promise<OpenFollowUp[]> {
  const ownerUser = alias(users, "follow_up_owner");
  const where = [
    eq(meetingFollowUps.organizationId, session.organizationId),
    eq(meetingFollowUps.status, "open"),
    // A cancelled meeting's commitments are not commitments.
    ne(meetings.status, "cancelled"),
    session.role === "admin" ? undefined : eq(meetings.confidential, false),
    accountIds ? inArray(meetings.accountId, accountIds) : undefined,
    ownerUserId ? eq(meetingFollowUps.ownerUserId, ownerUserId) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: meetingFollowUps.id,
      description: meetingFollowUps.description,
      dueOn: meetingFollowUps.dueOn,
      ownerUserId: meetingFollowUps.ownerUserId,
      ownerUserName: ownerUser.name,
      ownerContactName: contacts.name,
      ownerContactDesignation: contacts.designation,
      meetingId: meetings.id,
      meetingRef: meetings.ref,
      meetingLevel: meetings.level,
      accountId: meetings.accountId,
      accountName: accounts.name,
    })
    .from(meetingFollowUps)
    .innerJoin(meetings, eq(meetings.id, meetingFollowUps.meetingId))
    .innerJoin(accounts, eq(accounts.id, meetings.accountId))
    .leftJoin(ownerUser, eq(ownerUser.id, meetingFollowUps.ownerUserId))
    .leftJoin(contacts, eq(contacts.id, meetingFollowUps.ownerContactId))
    .where(and(...where))
    .orderBy(asc(meetingFollowUps.dueOn));

  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    dueOn: r.dueOn,
    side: r.ownerUserId ? "us" : "customer",
    ownerName: r.ownerUserId
      ? (r.ownerUserName ?? "Unassigned")
      : [r.ownerContactName, r.ownerContactDesignation].filter(Boolean).join(", ") ||
        "Their side",
    ownerUserId: r.ownerUserId,
    meetingId: r.meetingId,
    meetingRef: r.meetingRef,
    meetingLevel: r.meetingLevel,
    accountId: r.accountId,
    accountName: r.accountName,
  }));
}

/**
 * The chasing list: what is open on this person, or across the team.
 *
 * "Mine" is the default because that is the question a deal owner opens the
 * screen with. Everyone may see the team's list — a follow-up nobody can see
 * is a follow-up nobody picks up when its owner is on leave.
 */
export async function listFollowUps(scope: "mine" | "team" = "mine") {
  const session = await requireSales();
  const items = await openFollowUps(
    session,
    undefined,
    scope === "mine" ? session.userId : undefined,
  );
  return {
    today: todayInIndia(),
    // The team list is about what we owe; what a customer owes us is on the
    // board and in the thread, not in somebody's to-do list.
    items: scope === "mine" ? items : items.filter((i) => i.side === "us"),
  };
}

export type ThreadMeeting = {
  id: string;
  ref: number;
  parentMeetingId: string | null;
  level: MeetingLevel;
  kind: MeetingKind;
  status: MeetingStatus;
  metOn: string;
  title: string;
  agenda: string | null;
  notes: string | null;
  confidential: boolean;
  ownerName: string;
  createdByName: string | null;
  city: string | null;
  dealName: string | null;
  dealId: string | null;
  us: string[];
  them: { name: string; designation: string | null }[];
  topics: string[];
  followUps: {
    id: string;
    description: string;
    dueOn: string;
    status: "open" | "done" | "dropped";
    side: "us" | "customer";
    ownerName: string;
    closedNote: string | null;
    closedAt: Date | null;
    closedByName: string | null;
  }[];
};

/**
 * One customer's whole engagement history: the meetings, who was there, what
 * was committed, and the business facts to read it against.
 */
export async function getAccountThread(accountId: string) {
  const session = await requireSales();
  const org = session.organizationId;

  const [account] = await db
    .select({ id: accounts.id, name: accounts.name, isStrategic: accounts.isStrategic })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.organizationId, org)));
  if (!account) return null;

  const owner = alias(users, "meeting_owner");
  const author = alias(users, "meeting_author");
  const rows = await db
    .select({
      id: meetings.id,
      ref: meetings.ref,
      parentMeetingId: meetings.parentMeetingId,
      level: meetings.level,
      kind: meetings.kind,
      status: meetings.status,
      metOn: meetings.metOn,
      title: meetings.title,
      agenda: meetings.agenda,
      notes: meetings.notes,
      confidential: meetings.confidential,
      ownerName: owner.name,
      createdByName: author.name,
      city: cities.name,
      dealName: opportunities.name,
      dealId: opportunities.id,
    })
    .from(meetings)
    .innerJoin(owner, eq(owner.id, meetings.ownerUserId))
    .leftJoin(author, eq(author.id, meetings.createdByUserId))
    .leftJoin(cities, eq(cities.id, meetings.cityId))
    .leftJoin(opportunities, eq(opportunities.id, meetings.opportunityId))
    .where(and(visible(session), eq(meetings.accountId, accountId)))
    .orderBy(desc(meetings.metOn));

  const meetingIds = rows.map((r) => r.id);
  const [attendeeRows, topicRows, followUpRows] = await Promise.all([
    meetingIds.length
      ? db
          .select({
            meetingId: meetingAttendees.meetingId,
            userName: users.name,
            contactName: contacts.name,
            contactDesignation: contacts.designation,
          })
          .from(meetingAttendees)
          .leftJoin(users, eq(users.id, meetingAttendees.userId))
          .leftJoin(contacts, eq(contacts.id, meetingAttendees.contactId))
          .where(inArray(meetingAttendees.meetingId, meetingIds))
      : [],
    meetingIds.length
      ? db
          .select({ meetingId: meetingTopicLinks.meetingId, label: meetingTopics.label })
          .from(meetingTopicLinks)
          .innerJoin(meetingTopics, eq(meetingTopics.id, meetingTopicLinks.topicId))
          .where(inArray(meetingTopicLinks.meetingId, meetingIds))
      : [],
    meetingIds.length ? allFollowUps(meetingIds) : [],
  ]);

  const thread: ThreadMeeting[] = rows.map((r) => ({
    ...r,
    us: attendeeRows
      .filter((a) => a.meetingId === r.id && a.userName)
      .map((a) => a.userName!),
    them: attendeeRows
      .filter((a) => a.meetingId === r.id && a.contactName)
      .map((a) => ({ name: a.contactName!, designation: a.contactDesignation })),
    topics: topicRows.filter((t) => t.meetingId === r.id).map((t) => t.label),
    followUps: followUpRows.filter((f) => f.meetingId === r.id),
  }));

  const today = todayInIndia();
  const open: OpenFollowUp[] = [];
  for (const m of thread) {
    if (m.status === "cancelled") continue;
    for (const f of m.followUps) {
      if (f.status !== "open") continue;
      open.push({
        id: f.id,
        description: f.description,
        dueOn: f.dueOn,
        side: f.side,
        ownerName: f.ownerName,
        ownerUserId: null,
        meetingId: m.id,
        meetingRef: m.ref,
        meetingLevel: m.level,
        accountId,
        accountName: account.name,
      });
    }
  }
  const planned: PlannedMeeting[] = thread
    .filter((m) => m.status === "planned" && m.metOn >= today)
    .map((m) => ({
      id: m.id,
      ref: m.ref,
      title: m.title,
      metOn: m.metOn,
      ownerName: m.ownerName,
      level: m.level,
    }));
  const held = thread.filter((m) => m.status === "held" && m.metOn <= today);

  const deals = await db
    .select({
      id: opportunities.id,
      name: opportunities.name,
      stage: opportunities.stage,
      fleetSize: opportunities.fleetSize,
      deployed: opportunities.vehiclesDeployed,
      ownerName: users.name,
    })
    .from(opportunities)
    .innerJoin(users, eq(users.id, opportunities.ownerUserId))
    .where(and(eq(opportunities.organizationId, org), eq(opportunities.accountId, accountId)))
    .orderBy(desc(opportunities.updatedAt));
  const won = deals.filter((d) => d.stage === "closed_won");

  return {
    today,
    account,
    thread,
    state: boardState({ lastHeldOn: held[0]?.metOn ?? null, open, planned, today }),
    business: {
      soldVehicles: won.reduce((s, d) => s + d.fleetSize, 0),
      liveVehicles: won.reduce((s, d) => s + Math.min(d.fleetSize, d.deployed), 0),
      openDeals: deals.filter((d) => OPEN_STAGES.includes(d.stage)).length,
      owners: unique(deals.map((d) => d.ownerName)),
    },
    counts: {
      held: held.length,
      leadership: held.filter((m) => m.level === "leadership").length,
      openFollowUps: open.length,
      overdueFollowUps: open.filter((f) => f.dueOn < today).length,
    },
  };
}

async function allFollowUps(meetingIds: string[]) {
  const ownerUser = alias(users, "fu_owner");
  const closer = alias(users, "fu_closer");
  const rows = await db
    .select({
      id: meetingFollowUps.id,
      meetingId: meetingFollowUps.meetingId,
      description: meetingFollowUps.description,
      dueOn: meetingFollowUps.dueOn,
      status: meetingFollowUps.status,
      ownerUserId: meetingFollowUps.ownerUserId,
      ownerUserName: ownerUser.name,
      ownerContactName: contacts.name,
      ownerContactDesignation: contacts.designation,
      closedNote: meetingFollowUps.closedNote,
      closedAt: meetingFollowUps.closedAt,
      closedByName: closer.name,
    })
    .from(meetingFollowUps)
    .leftJoin(ownerUser, eq(ownerUser.id, meetingFollowUps.ownerUserId))
    .leftJoin(contacts, eq(contacts.id, meetingFollowUps.ownerContactId))
    .leftJoin(closer, eq(closer.id, meetingFollowUps.closedByUserId))
    .where(inArray(meetingFollowUps.meetingId, meetingIds))
    .orderBy(asc(meetingFollowUps.dueOn));

  return rows.map((r) => ({
    id: r.id,
    meetingId: r.meetingId,
    description: r.description,
    dueOn: r.dueOn,
    status: r.status,
    side: (r.ownerUserId ? "us" : "customer") as "us" | "customer",
    ownerName: r.ownerUserId
      ? (r.ownerUserName ?? "Unassigned")
      : [r.ownerContactName, r.ownerContactDesignation].filter(Boolean).join(", ") ||
        "Their side",
    closedNote: r.closedNote,
    closedAt: r.closedAt,
    closedByName: r.closedByName,
  }));
}

/**
 * Everything the Log a meeting sheet needs: customers, our people, the topic
 * list, and — for the customer already chosen — its contacts, deals and the
 * meetings a new one could be a follow-up to.
 */
export async function loadMeetingFormData(accountId?: string) {
  const session = await requireSales();
  const org = session.organizationId;

  const [accountRows, userRows, topicRows, cityRows] = await Promise.all([
    db
      .select({ id: accounts.id, name: accounts.name, isStrategic: accounts.isStrategic })
      .from(accounts)
      .where(eq(accounts.organizationId, org))
      .orderBy(asc(accounts.name)),
    db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.organizationId, org), eq(users.isActive, true)))
      .orderBy(asc(users.name)),
    db
      .select({ id: meetingTopics.id, label: meetingTopics.label })
      .from(meetingTopics)
      .where(and(eq(meetingTopics.organizationId, org), eq(meetingTopics.isActive, true)))
      .orderBy(asc(meetingTopics.sortOrder), asc(meetingTopics.label)),
    db
      .select({ id: cities.id, name: cities.name })
      .from(cities)
      .where(and(eq(cities.organizationId, org), eq(cities.isActive, true)))
      .orderBy(asc(cities.sortOrder), asc(cities.name)),
  ]);

  const forAccount = accountId
    ? await Promise.all([
        db
          .select({
            id: contacts.id,
            name: contacts.name,
            designation: contacts.designation,
          })
          .from(contacts)
          .where(and(eq(contacts.organizationId, org), eq(contacts.accountId, accountId)))
          .orderBy(asc(contacts.name)),
        db
          .select({ id: opportunities.id, name: opportunities.name, stage: opportunities.stage })
          .from(opportunities)
          .where(
            and(eq(opportunities.organizationId, org), eq(opportunities.accountId, accountId)),
          )
          .orderBy(desc(opportunities.updatedAt)),
        db
          .select({
            id: meetings.id,
            ref: meetings.ref,
            title: meetings.title,
            metOn: meetings.metOn,
            level: meetings.level,
          })
          .from(meetings)
          .where(and(visible(session), eq(meetings.accountId, accountId)))
          .orderBy(desc(meetings.metOn))
          .limit(25),
      ])
    : [[], [], []];

  return {
    today: todayInIndia(),
    me: { id: session.userId, name: session.name },
    accounts: accountRows,
    users: userRows.filter((u) => u.role === "admin" || u.role === "sales"),
    topics: topicRows,
    cities: cityRows,
    contacts: forAccount[0],
    deals: forAccount[1],
    parents: forAccount[2],
  };
}

/** The contacts, deals and parent meetings for a customer chosen in the sheet. */
export async function loadAccountExtras(accountId: string) {
  const data = await loadMeetingFormData(accountId);
  return { contacts: data.contacts, deals: data.deals, parents: data.parents };
}

/* ------------------------------------------------------------------ helpers */

function unique(values: string[]) {
  return [...new Set(values)];
}

/** "2026-11-27" -> "2026-10-01" — the quarter the date sits in, calendar quarters. */
export function startOfQuarter(today: string) {
  const [y, m] = today.split("-").map(Number);
  const first = Math.floor((m! - 1) / 3) * 3 + 1;
  return `${y}-${String(first).padStart(2, "0")}-01`;
}

function aYearBefore(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  return `${y! - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
