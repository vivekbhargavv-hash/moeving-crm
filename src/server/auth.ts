import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { shouldRecordSeen } from "@/lib/last-seen";
import { organizations, users } from "@/db/schema";

export type Session = {
  userId: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
};

export type UserRole = (typeof users.role.enumValues)[number];

export class NotProvisionedError extends Error {
  constructor(readonly email: string) {
    super(`No CRM account for ${email}`);
  }
}

/**
 * The single door into tenant data.
 *
 * Everything server-side derives organizationId from here — it is never read
 * from a form, a query string or a header, so a signed-in user of org A has no
 * way to address org B's rows.
 */
export const requireSession = cache(async (): Promise<Session> => {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  const byClerkId = await db.query.users.findFirst({
    where: and(eq(users.clerkUserId, clerkUserId), eq(users.isActive, true)),
  });
  if (byClerkId) {
    await recordSeen(byClerkId.id, byClerkId.lastSeenAt);
    return toSession(byClerkId);
  }

  // First sign-in: an admin created the row by email ahead of the invite.
  const clerk = await currentUser();
  const email = clerk?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) throw new NotProvisionedError("unknown");

  const invited = await db.query.users.findFirst({
    where: and(eq(users.email, email), eq(users.isActive, true)),
  });
  if (!invited) throw new NotProvisionedError(email);

  const [linked] = await db
    .update(users)
    .set({
      clerkUserId,
      // They are in; the accept link is spent and should not sit in the row.
      inviteUrl: null,
      // The one sign-in whose moment we know exactly.
      lastSeenAt: new Date(),
      name:
        invited.name ||
        [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ") ||
        email,
    })
    .where(eq(users.id, invited.id))
    .returning();

  return toSession(linked!);
});

/**
 * Note that this person is here.
 *
 * Throttled, because this guard runs on every server-rendered page and the
 * figure is read by an admin wondering whether someone has started using the
 * CRM — not to the minute. Anyone active costs one UPDATE by primary key
 * every few minutes; everybody else costs nothing.
 *
 * A failure here is never allowed to cost someone their page: last seen is
 * the least important thing this request is doing.
 */
async function recordSeen(userId: string, lastSeenAt: Date | null) {
  if (!shouldRecordSeen(lastSeenAt)) return;
  try {
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, userId));
  } catch {
    /* ignored on purpose */
  }
}

/** Where someone lands when they reach for a page that is not theirs. */
export function homeFor(role: UserRole) {
  if (role === "ops") return "/deployments";
  if (role === "noc") return "/leads";
  return "/dashboard";
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  // Sending them home beats a 500. Reaching Admin without the role is a
  // stale link or a guessed URL, not an incident.
  if (session.role !== "admin") redirect(homeFor(session.role));
  return session;
}

/**
 * The door to everything commercial: the pipeline, the forecast, a deal and
 * its margins, the CSV export.
 *
 * Ops are in this organization to put trucks on the road, not to see what a
 * customer pays. They get Deployments and Settings; everything else sends
 * them back there rather than 403-ing at a screen they never asked for.
 *
 * This is a call at the top of each such page, not a middleware path match —
 * the same reason `requireSession()` is: a pattern list drifts from how Next
 * actually routes, and a miss there is silent.
 */
export async function requireSales(): Promise<Session> {
  const session = await requireSession();
  if (session.role === "ops" || session.role === "noc") {
    redirect(homeFor(session.role));
  }
  return session;
}

/**
 * The door to inbound leads: the NOC desk who take the calls, and the deal
 * owners who ring them back.
 *
 * Ops are deliberately not here. They put trucks on the road for deals that
 * already exist, and an enquiry carries a customer's name, number and email
 * that they have no reason to hold.
 */
export async function requireLeads(): Promise<Session> {
  const session = await requireSession();
  if (session.role === "ops") redirect(homeFor(session.role));
  return session;
}

/**
 * Turning a lead into a deal is a deal owner's act, not the phone desk's.
 * NOC write down what was said; what it is worth is somebody else's call.
 */
export async function requireDealOwner(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "sales") {
    redirect(homeFor(session.role));
  }
  return session;
}

/**
 * The operations queue: ops, sales and admin.
 *
 * NOC are turned away. A deployment is a promise made months after the call
 * they took, and the desk that answers the phone has no part in keeping it.
 */
export async function requireDeployments(): Promise<Session> {
  const session = await requireSession();
  if (session.role === "noc") redirect(homeFor(session.role));
  return session;
}

function toSession(row: typeof users.$inferSelect): Session {
  return {
    userId: row.id,
    organizationId: row.organizationId,
    name: row.name,
    email: row.email,
    role: row.role,
  };
}

/** Used by the seed/bootstrap path only. */
export async function organizationBySlug(slug: string) {
  return db.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
  });
}
