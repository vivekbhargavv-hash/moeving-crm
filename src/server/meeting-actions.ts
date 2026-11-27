"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  accounts,
  contacts,
  meetingAttendees,
  meetingFollowUps,
  meetingTopicLinks,
  meetingTopics,
  meetings,
  opportunities,
  users,
} from "@/db/schema";
import { meetingId as meetingRefId } from "@/lib/record-ids";
import { todayInIndia } from "@/lib/utils";
import type { ActionResult } from "@/server/actions";
import { requireAdmin, requireSales } from "@/server/auth";
import { loadAccountExtras } from "@/server/meeting-queries";
import { pushToUser } from "@/server/push";

/**
 * Writing the meetings module.
 *
 * None of these run in a transaction, and that is deliberate: production runs
 * Neon over HTTP, whose driver throws the moment `db.transaction()` is called
 * (see HANDOFF § 6). So every write here is ordered so that a failure
 * part-way through leaves something a person can read and finish by hand —
 * the meeting and its notes go in first, because they are the part nobody can
 * reconstruct, and the attendees, topics and follow-ups follow.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const uuid = z.string().uuid();
const date = z.string().regex(ISO_DATE, "Pick a date");

const followUpInput = z
  .object({
    description: z.string().trim().min(3, "Say what the follow-up is").max(500),
    /** Ours. Exactly one of these two is set. */
    ownerUserId: uuid.nullable().default(null),
    /** Theirs — when the ball is on the customer's side. */
    ownerContactId: uuid.nullable().default(null),
    dueOn: date,
  })
  .refine((f) => Boolean(f.ownerUserId) !== Boolean(f.ownerContactId), {
    message: "A follow-up needs exactly one owner",
  });

const meetingInput = z.object({
  accountId: uuid,
  level: z.enum(["leadership", "regional", "operational"]),
  kind: z.enum(["in_person", "call", "video"]),
  metOn: date,
  title: z.string().trim().min(3, "Give the meeting a one-line title").max(140),
  agenda: z.string().trim().max(2000).nullable().default(null),
  notes: z.string().trim().max(8000).nullable().default(null),
  confidential: z.boolean().default(false),
  /** Whose meeting it is — not necessarily whoever is typing. */
  ownerUserId: uuid,
  opportunityId: uuid.nullable().default(null),
  cityId: uuid.nullable().default(null),
  parentMeetingId: uuid.nullable().default(null),
  attendeeUserIds: z.array(uuid).max(20).default([]),
  attendeeContactIds: z.array(uuid).max(20).default([]),
  topicIds: z.array(uuid).max(20).default([]),
  followUps: z.array(followUpInput).max(20).default([]),
  /** The next meeting, created as a child of this one. */
  nextMeeting: z
    .object({
      metOn: date,
      kind: z.enum(["in_person", "call", "video"]),
      title: z.string().trim().min(3).max(140),
      ownerUserId: uuid,
      level: z.enum(["leadership", "regional", "operational"]),
    })
    .nullable()
    .default(null),
});

export type MeetingInput = z.input<typeof meetingInput>;

export async function createMeeting(
  input: MeetingInput,
): Promise<ActionResult<{ id: string; ref: number }>> {
  const session = await requireSales();
  const parsed = meetingInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const m = parsed.data;
  const org = session.organizationId;
  const today = todayInIndia();

  /*
   * Held or planned is the date's business, not a field somebody can get
   * wrong: a meeting in the future is planned, one today or earlier is held.
   * That is also why notes are required below only for the second kind.
   */
  const status = m.metOn > today ? "planned" : "held";
  if (status === "held" && !m.notes) {
    return { ok: false, error: "Write down what was discussed." };
  }
  if (m.confidential && session.role !== "admin") {
    return {
      ok: false,
      error:
        "Only an admin can mark a meeting confidential — it would hide the meeting from you too.",
    };
  }

  const checked = await checkReferences(org, m);
  if (!checked.ok) return checked;

  const [row] = await db
    .insert(meetings)
    .values({
      organizationId: org,
      accountId: m.accountId,
      opportunityId: m.opportunityId,
      cityId: m.cityId,
      parentMeetingId: m.parentMeetingId,
      level: m.level,
      kind: m.kind,
      status,
      metOn: m.metOn,
      title: m.title,
      agenda: m.agenda,
      notes: m.notes,
      confidential: m.confidential,
      ownerUserId: m.ownerUserId,
      createdByUserId: session.userId,
    })
    // No column list: `db` is a union of the Neon-HTTP and node-postgres
    // drivers, and only the bare form type-checks against both.
    .returning();
  const meeting = { id: row!.id, ref: row!.ref };

  // The owner is in the room by definition; the sheet does not make anyone
  // tick their own name.
  const userIds = [...new Set([m.ownerUserId, ...m.attendeeUserIds])];
  const attendees = [
    ...userIds.map((userId) => ({
      organizationId: org,
      meetingId: meeting.id,
      userId,
      contactId: null,
    })),
    ...[...new Set(m.attendeeContactIds)].map((contactId) => ({
      organizationId: org,
      meetingId: meeting.id,
      userId: null,
      contactId,
    })),
  ];
  if (attendees.length) await db.insert(meetingAttendees).values(attendees);

  if (m.topicIds.length) {
    await db.insert(meetingTopicLinks).values(
      [...new Set(m.topicIds)].map((topicId) => ({ meetingId: meeting.id, topicId })),
    );
  }

  if (m.followUps.length) {
    await db.insert(meetingFollowUps).values(
      m.followUps.map((f) => ({
        organizationId: org,
        meetingId: meeting.id,
        description: f.description,
        ownerUserId: f.ownerUserId,
        ownerContactId: f.ownerContactId,
        dueOn: f.dueOn,
        createdByUserId: session.userId,
      })),
    );
  }

  // The next meeting, as a child of this one, so the thread already shows
  // where the conversation goes next.
  if (m.nextMeeting) {
    await db.insert(meetings).values({
      organizationId: org,
      accountId: m.accountId,
      opportunityId: m.opportunityId,
      cityId: m.cityId,
      parentMeetingId: meeting.id,
      level: m.nextMeeting.level,
      kind: m.nextMeeting.kind,
      status: m.nextMeeting.metOn > today ? "planned" : "held",
      metOn: m.nextMeeting.metOn,
      title: m.nextMeeting.title,
      // A meeting that has not happened has an agenda, not notes — and the
      // database refuses a held meeting without them, so a date typed in the
      // past is sent back rather than written half-formed.
      agenda: m.nextMeeting.title,
      notes: m.nextMeeting.metOn > today ? null : "To be written up.",
      confidential: m.confidential,
      ownerUserId: m.nextMeeting.ownerUserId,
      createdByUserId: session.userId,
    });
  }

  await notifyFollowUpOwners(org, session.userId, meeting.id, m);

  revalidateMeetings(m.accountId);
  return { ok: true, data: meeting };
}

/**
 * One more commitment on an existing meeting — including the "Set next step"
 * button the board shows against an account that has gone quiet.
 */
export async function addFollowUp(
  meetingIdValue: string,
  input: z.input<typeof followUpInput>,
): Promise<ActionResult> {
  const session = await requireSales();
  const parsed = followUpInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const f = parsed.data;

  const meeting = await loadMeeting(session.organizationId, meetingIdValue, session.role);
  if (!meeting) return { ok: false, error: "That meeting is not there any more." };

  if (f.ownerUserId) {
    const ok = await exists(users, session.organizationId, f.ownerUserId);
    if (!ok) return { ok: false, error: "That person is not in this organization." };
  }
  if (f.ownerContactId) {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, f.ownerContactId),
          eq(contacts.accountId, meeting.accountId),
        ),
      );
    if (!contact) return { ok: false, error: "That contact is not at this customer." };
  }

  await db.insert(meetingFollowUps).values({
    organizationId: session.organizationId,
    meetingId: meeting.id,
    description: f.description,
    ownerUserId: f.ownerUserId,
    ownerContactId: f.ownerContactId,
    dueOn: f.dueOn,
    createdByUserId: session.userId,
  });

  if (f.ownerUserId && f.ownerUserId !== session.userId) {
    await pushFollowUp(session.organizationId, f.ownerUserId, {
      accountId: meeting.accountId,
      description: f.description,
      dueOn: f.dueOn,
      ref: meeting.ref,
    });
  }

  revalidateMeetings(meeting.accountId);
  return { ok: true };
}

const closeInput = z.object({
  status: z.enum(["done", "dropped"]),
  note: z.string().trim().max(500).nullable().default(null),
});

/** Done, or dropped with a reason. A dropped follow-up is never a shrug. */
export async function closeFollowUp(
  id: string,
  input: z.input<typeof closeInput>,
): Promise<ActionResult> {
  const session = await requireSales();
  const parsed = closeInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { status, note } = parsed.data;
  if (status === "dropped" && !note) {
    return { ok: false, error: "Say why it is being dropped." };
  }

  const [row] = await db
    .select({ id: meetingFollowUps.id, accountId: meetings.accountId })
    .from(meetingFollowUps)
    .innerJoin(meetings, eq(meetings.id, meetingFollowUps.meetingId))
    .where(
      and(
        eq(meetingFollowUps.id, id),
        eq(meetingFollowUps.organizationId, session.organizationId),
      ),
    );
  if (!row) return { ok: false, error: "That follow-up is not there any more." };

  await db
    .update(meetingFollowUps)
    .set({
      status,
      closedNote: note,
      closedAt: new Date(),
      closedByUserId: session.userId,
    })
    .where(eq(meetingFollowUps.id, id));

  revalidateMeetings(row.accountId);
  return { ok: true };
}

/** Back to open — for the tap that closed the wrong line. */
export async function reopenFollowUp(id: string): Promise<ActionResult> {
  const session = await requireSales();
  const [row] = await db
    .select({ id: meetingFollowUps.id, accountId: meetings.accountId })
    .from(meetingFollowUps)
    .innerJoin(meetings, eq(meetings.id, meetingFollowUps.meetingId))
    .where(
      and(
        eq(meetingFollowUps.id, id),
        eq(meetingFollowUps.organizationId, session.organizationId),
      ),
    );
  if (!row) return { ok: false, error: "That follow-up is not there any more." };

  await db
    .update(meetingFollowUps)
    .set({ status: "open", closedAt: null, closedByUserId: null, closedNote: null })
    .where(eq(meetingFollowUps.id, id));

  revalidateMeetings(row.accountId);
  return { ok: true };
}

const contactInput = z.object({
  accountId: uuid,
  name: z.string().trim().min(2, "Enter their name").max(120),
  designation: z.string().trim().max(120).nullable().default(null),
  email: z.string().trim().email("That email does not look right").nullable().default(null),
  mobile: z.string().trim().max(30).nullable().default(null),
  isDecisionMaker: z.boolean().default(false),
});

/** A person at the customer's end, added from the attendee field itself. */
export async function createContact(
  input: z.input<typeof contactInput>,
): Promise<ActionResult<{ id: string; name: string; designation: string | null }>> {
  const session = await requireSales();
  const parsed = contactInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const c = parsed.data;
  if (!(await exists(accounts, session.organizationId, c.accountId))) {
    return { ok: false, error: "That customer is not there any more." };
  }

  try {
    const [row] = await db
      .insert(contacts)
      .values({
        organizationId: session.organizationId,
        accountId: c.accountId,
        name: c.name,
        designation: c.designation,
        email: c.email,
        mobile: c.mobile,
        isDecisionMaker: c.isDecisionMaker,
        createdByUserId: session.userId,
      })
      .returning();
    revalidateMeetings(c.accountId);
    return {
      ok: true,
      data: { id: row!.id, name: row!.name, designation: row!.designation },
    };
  } catch {
    // The unique index on (account, name) is the one thing that can fail here.
    return {
      ok: false,
      error: `${c.name} is already on this customer. Pick them from the list.`,
    };
  }
}

/** Puts a customer on the leadership watchlist, or takes it off. Admin only. */
export async function setStrategic(
  accountId: string,
  isStrategic: boolean,
): Promise<ActionResult> {
  const session = await requireAdmin();
  const [row] = await db
    .update(accounts)
    .set({ isStrategic })
    .where(
      and(eq(accounts.id, accountId), eq(accounts.organizationId, session.organizationId)),
    )
    .returning();
  if (!row) return { ok: false, error: "That customer is not there any more." };

  revalidateMeetings(accountId);
  return { ok: true };
}

/**
 * The contacts, deals and parent meetings for the customer chosen in the Log
 * a meeting sheet — fetched when it is chosen, not loaded for all 104
 * customers with the page.
 */
export async function fetchAccountExtras(
  accountId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof loadAccountExtras>>>> {
  if (!uuid.safeParse(accountId).success) {
    return { ok: false, error: "Pick a customer." };
  }
  const data = await loadAccountExtras(accountId);
  return { ok: true, data };
}

/* ------------------------------------------------------------------ helpers */

function revalidateMeetings(accountId: string) {
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${accountId}`);
  revalidatePath(`/customers/${accountId}`);
}

async function loadMeeting(organizationId: string, id: string, role: string) {
  const [row] = await db
    .select({
      id: meetings.id,
      ref: meetings.ref,
      accountId: meetings.accountId,
      confidential: meetings.confidential,
    })
    .from(meetings)
    .where(and(eq(meetings.id, id), eq(meetings.organizationId, organizationId)));
  if (!row) return null;
  // What cannot be read cannot be added to.
  if (row.confidential && role !== "admin") return null;
  return row;
}

/**
 * Everything the input points at has to belong to this organization — and, for
 * the things that hang off a customer, to that customer. The session supplies
 * the organization; a form never does.
 */
async function checkReferences(
  org: string,
  m: z.output<typeof meetingInput>,
): Promise<ActionResult> {
  if (!(await exists(accounts, org, m.accountId))) {
    return { ok: false, error: "That customer is not there any more." };
  }
  if (!(await exists(users, org, m.ownerUserId))) {
    return { ok: false, error: "That person is not in this organization." };
  }
  if (m.nextMeeting && !(await exists(users, org, m.nextMeeting.ownerUserId))) {
    return { ok: false, error: "That person is not in this organization." };
  }

  if (m.opportunityId) {
    const [deal] = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.id, m.opportunityId),
          eq(opportunities.organizationId, org),
          eq(opportunities.accountId, m.accountId),
        ),
      );
    if (!deal) return { ok: false, error: "That deal is not this customer's." };
  }

  if (m.parentMeetingId) {
    const [parent] = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(
        and(
          eq(meetings.id, m.parentMeetingId),
          eq(meetings.organizationId, org),
          eq(meetings.accountId, m.accountId),
        ),
      );
    if (!parent) {
      return { ok: false, error: "That earlier meeting is not this customer's." };
    }
  }

  const contactIds = [
    ...new Set([
      ...m.attendeeContactIds,
      ...m.followUps.map((f) => f.ownerContactId).filter((c): c is string => Boolean(c)),
    ]),
  ];
  if (contactIds.length) {
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.accountId, m.accountId), inArray(contacts.id, contactIds)));
    if (rows.length !== contactIds.length) {
      return { ok: false, error: "One of those people is not at this customer." };
    }
  }

  const ownerIds = [
    ...new Set([
      ...m.attendeeUserIds,
      ...m.followUps.map((f) => f.ownerUserId).filter((u): u is string => Boolean(u)),
    ]),
  ];
  if (ownerIds.length) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organizationId, org), inArray(users.id, ownerIds)));
    if (rows.length !== ownerIds.length) {
      return { ok: false, error: "One of those people is not in this organization." };
    }
  }

  if (m.topicIds.length) {
    const rows = await db
      .select({ id: meetingTopics.id })
      .from(meetingTopics)
      .where(
        and(eq(meetingTopics.organizationId, org), inArray(meetingTopics.id, m.topicIds)),
      );
    if (rows.length !== m.topicIds.length) {
      return { ok: false, error: "One of those topics no longer exists." };
    }
  }

  return { ok: true };
}

async function exists(
  table: typeof accounts | typeof users,
  organizationId: string,
  id: string,
) {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.organizationId, organizationId)));
  return Boolean(row);
}

async function notifyFollowUpOwners(
  org: string,
  actorUserId: string,
  createdMeetingId: string,
  m: z.output<typeof meetingInput>,
) {
  const [meeting] = await db
    .select({ ref: meetings.ref, accountId: meetings.accountId })
    .from(meetings)
    .where(eq(meetings.id, createdMeetingId));
  if (!meeting) return;

  const owed = new Map<string, { description: string; dueOn: string }>();
  for (const f of m.followUps) {
    // Nobody needs telling about the thing they just typed.
    if (!f.ownerUserId || f.ownerUserId === actorUserId) continue;
    if (!owed.has(f.ownerUserId)) owed.set(f.ownerUserId, f);
  }

  await Promise.all(
    [...owed.entries()].map(([userId, f]) =>
      pushFollowUp(org, userId, {
        accountId: meeting.accountId,
        description: f.description,
        dueOn: f.dueOn,
        ref: meeting.ref,
      }),
    ),
  );
}

async function pushFollowUp(
  org: string,
  userId: string,
  f: { accountId: string; description: string; dueOn: string; ref: number },
) {
  try {
    await pushToUser(org, userId, {
      title: "Follow-up for you",
      body: `${f.description} — due ${f.dueOn}`,
      url: `/meetings/${f.accountId}`,
      tag: `follow-up-${meetingRefId(f.ref)}`,
    });
  } catch {
    // A notification that does not arrive must never cost somebody the
    // meeting they just wrote up.
  }
}
