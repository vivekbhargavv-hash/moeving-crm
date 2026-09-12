"use client";

import { UserButton } from "@clerk/nextjs";
import {
  BarChart3,
  CalendarRange,
  KanbanSquare,
  Plus,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { QuickAdd } from "@/components/quick-add";
import type { MasterData } from "@/components/quick-add";
import type { Session } from "@/server/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/forecast", label: "Forecast", icon: CalendarRange },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
];

export function AppShell({
  session,
  master,
  children,
}: {
  session: Session;
  master: MasterData;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [addOpen, setAddOpen] = React.useState(false);

  // /pipeline?new=1 — the PWA "New deal" shortcut and any deep link.
  React.useEffect(() => {
    if (params.get("new") === "1") {
      setAddOpen(true);
      router.replace(pathname);
    }
  }, [params, pathname, router]);

  const nav = session.role === "admin"
    ? [...NAV, { href: "/admin/users", label: "Admin", icon: Settings }]
    : NAV;

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop rail */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-line bg-white px-3 py-5">
        <div className="px-3 pb-6">
          <p className="text-[17px] font-semibold tracking-tight">MoEVing</p>
          <p className="text-xs text-muted">Sales CRM</p>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition",
                  active
                    ? "bg-brand-soft text-brand-ink"
                    : "text-muted hover:bg-canvas hover:text-ink",
                )}
              >
                <item.icon size={18} strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => setAddOpen(true)}
          className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-ink font-medium text-white hover:bg-ink/90"
        >
          <Plus size={18} /> New deal
        </button>
        <div className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2">
          <UserButton />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{session.name}</p>
            <p className="truncate text-xs capitalize text-muted">{session.role}</p>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 pb-24 md:pb-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/90 px-4 py-3 backdrop-blur">
          <p className="text-[17px] font-semibold tracking-tight">
            {nav.find((n) => pathname.startsWith(n.href))?.label ?? "MoEVing"}
          </p>
          <UserButton />
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-4 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav + FAB */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur safe-bottom">
        <div className="mx-auto grid max-w-md grid-cols-4 items-center">
          {nav.slice(0, 2).map((item) => (
            <NavTab key={item.href} {...item} pathname={pathname} />
          ))}
          <button
            onClick={() => setAddOpen(true)}
            aria-label="New deal"
            className="mx-auto -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-lg shadow-ink/25 active:scale-95 transition"
          >
            <Plus size={26} strokeWidth={2.5} />
          </button>
          <NavTab {...nav[2]!} pathname={pathname} />
        </div>
      </nav>

      <QuickAdd
        open={addOpen}
        onClose={() => setAddOpen(false)}
        master={master}
        session={session}
      />
    </div>
  );
}

function NavTab({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  pathname: string;
}) {
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition",
        active ? "text-brand-ink" : "text-muted",
      )}
    >
      <Icon size={22} strokeWidth={active ? 2.4 : 2} />
      {label}
    </Link>
  );
}
