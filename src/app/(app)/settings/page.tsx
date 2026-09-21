import { ChevronRight, Database, Users } from "lucide-react";
import Link from "next/link";

import { InstallApp } from "@/components/install-app";
import { Card, CardHeader } from "@/components/ui-server";
import { requireSession } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * Everyone's settings, not just an admin's.
 *
 * The install button belongs to whoever is carrying the phone, which is mostly
 * the sales team. Admin links stay admin-only, below.
 */
export default async function SettingsPage() {
  const session = await requireSession();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          Settings
        </h1>
        <p className="text-sm text-muted">
          Signed in as {session.name} · {session.email}
        </p>
      </div>

      <Card>
        <CardHeader title="Install the app" />
        <div className="px-4 pb-4">
          <InstallApp />
        </div>
      </Card>

      {session.role === "admin" ? (
        <Card className="mt-3">
          <CardHeader title="Admin" />
          <div className="px-2 pb-2">
            <AdminLink href="/admin/users" icon={<Users size={17} />} label="Users" />
            <AdminLink
              href="/admin/master-data"
              icon={<Database size={17} />}
              label="Master data"
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function AdminLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-12 items-center gap-3 rounded-xl px-2 text-[15px] font-medium hover:bg-canvas"
    >
      <span className="text-muted">{icon}</span>
      {label}
      <ChevronRight size={17} className="ml-auto text-muted" />
    </Link>
  );
}
