import { asc, eq, sql } from "drizzle-orm";

import { AdminUsers } from "@/components/admin/users";
import { db } from "@/db";
import { opportunities, users } from "@/db/schema";
import { lastSeenExact, lastSeenLabel } from "@/lib/last-seen";
import { requireAdmin } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireAdmin();
  const now = new Date();
  // The deal count decides whether someone can be deleted at all, so it is
  // read here rather than discovered by a failed delete.
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      clerkUserId: users.clerkUserId,
      invitedAt: users.invitedAt,
      inviteUrl: users.inviteUrl,
      lastSeenAt: users.lastSeenAt,
      // Table names are spelled out rather than interpolated: Drizzle renders
      // a column inside a sql template UNQUALIFIED, so `${users.id}` in a
      // subquery over opportunities becomes a bare "id" that resolves to the
      // inner table — a self-comparison that silently counts zero.
      dealCount: sql<number>`count("opportunities"."id")::int`,
    })
    .from(users)
    .leftJoin(opportunities, eq(opportunities.ownerUserId, users.id))
    .where(eq(users.organizationId, session.organizationId))
    .groupBy(users.id)
    .orderBy(asc(users.name));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="hidden text-xl font-semibold tracking-tight md:block md:text-2xl">Users</h1>
        <p className="text-sm text-muted">
          Adding someone here emails them a sign-up link, and keeps a copy of
          that link in case the email does not arrive. They are linked to this
          CRM the first time they sign in.
        </p>
      </div>
      <AdminUsers
        currentUserId={session.userId}
        users={rows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          linked: Boolean(u.clerkUserId),
          invitedAt: u.invitedAt,
          inviteUrl: u.inviteUrl,
          dealCount: u.dealCount,
          // Worked out here, not in the browser: a relative label computed on
          // both sides would disagree by a second and break hydration.
          lastSeen: lastSeenLabel(u.lastSeenAt, now),
          lastSeenExact: lastSeenExact(u.lastSeenAt),
        }))}
      />
    </div>
  );
}
