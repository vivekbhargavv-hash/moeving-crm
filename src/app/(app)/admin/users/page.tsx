import { and, eq } from "drizzle-orm";
import { asc } from "drizzle-orm";

import { AdminUsers } from "@/components/admin/users";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireAdmin();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.organizationId, session.organizationId))
    .orderBy(asc(users.name));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Users</h1>
        <p className="text-sm text-muted">
          Add someone here first, then invite that same email in Clerk. They are
          linked on first sign-in.
        </p>
      </div>
      <AdminUsers
        users={rows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          linked: Boolean(u.clerkUserId),
        }))}
      />
    </div>
  );
}
