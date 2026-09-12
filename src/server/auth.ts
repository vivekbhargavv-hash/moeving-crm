import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { organizations, users } from "@/db/schema";

export type Session = {
  userId: string;
  organizationId: string;
  name: string;
  email: string;
  role: "admin" | "sales";
};

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
  if (byClerkId) return toSession(byClerkId);

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
      name:
        invited.name ||
        [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ") ||
        email,
    })
    .where(eq(users.id, invited.id))
    .returning();

  return toSession(linked!);
});

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin") throw new Error("FORBIDDEN");
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
