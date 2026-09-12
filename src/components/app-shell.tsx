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
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/forecast", label: "Forecast", icon: CalendarRange },
];

/** Page titles for the mobile header, so it never says "MoEVing" vaguely. */
const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/pipeline": "Pipeline",
  "/forecast": "Forecast",
  "/opportunities": "Deal",
  "/admin/users": "Users",
  "/admin/master-data": "Master data",
};

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

  const [toast, setToast] = React.useState<string | null>(null);

  // /pipeline?new=1 — the PWA "New deal" shortcut and any deep link.
  // /pipeline?created=N — confirmation after creating several deals at once.
  React.useEffect(() => {
    if (params.get("new") === "1") {
      setAddOpen(true);
      router.replace(pathname);
    }
    const created = Number(params.get("created"));
    if (created > 0) {
      setToast(`${created} deals created`);
      router.replace(pathname);
    }
  }, [params, pathname, router]);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const nav = session.role === "admin"
    ? [...NAV, { href: "/admin/users", label: "Admin", icon: Settings }]
    : NAV;

  const title =
    pathname.startsWith("/forecast") && params.get("tab") === "wins"
      ? "Wins"
      : (Object.entries(TITLES).find(([href]) => pathname.startsWith(href))?.[1] ??
        "Good Deal");

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white px-3 py-5 md:flex">
        <div className="px-3 pb-6">
          <p className="text-[17px] font-semibold tracking-tight">Good Deal</p>
          <p className="text-xs text-muted">MoEVing sales</p>
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
          className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-brand font-medium text-white hover:brightness-95"
        >
          <Plus size={18} /> New deal
        </button>
        <div className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2">
          <UserButton />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{session.name}</p>
            <p className="truncate text-xs text-muted">
              {session.role === "admin" ? "Admin" : "Deal Owner"}
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Mobile header: one line, the page you are on, and you. */}
        <header className="glass sticky top-0 z-30 border-b border-line/70 md:hidden">
          <div className="flex items-center justify-between px-4 pb-2.5 pt-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
            <div className="flex items-center gap-2">
              {session.role === "admin" ? (
                <Link
                  href="/admin/users"
                  aria-label="Admin"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-canvas"
                >
                  <Settings size={19} />
                </Link>
              ) : null}
              <UserButton />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-3 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      {/* Mobile tab bar: Dashboard, Pipeline, Forecast, Add. */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_rgba(16,24,40,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/60 md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map((item) => (
            <NavTab key={item.href} {...item} pathname={pathname} />
          ))}
          <button
            onClick={() => setAddOpen(true)}
            aria-label="Add deal"
            className="flex flex-col items-center gap-1 py-2 text-[11px] font-semibold text-brand-ink active:scale-95"
          >
            <span className="-mt-6 mb-0.5 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/40 ring-[5px] ring-white/70">
              <Plus size={28} strokeWidth={2.8} />
            </span>
            Add deal
          </button>
        </div>
      </nav>

      {toast ? (
        <div
          role="status"
          className="fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto w-fit max-w-[92vw] rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      ) : null}

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
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 py-2 text-[11px] font-semibold tracking-[0.01em] transition active:opacity-70",
        active ? "text-brand-ink" : "text-ink/60",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-12 items-center justify-center rounded-full transition",
          active && "bg-brand-soft",
        )}
      >
        <Icon size={20} strokeWidth={active ? 2.5 : 2} />
      </span>
      {label}
    </Link>
  );
}
