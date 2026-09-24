"use client";

import { UserButton } from "@clerk/nextjs";
import {
  BarChart3,
  Calculator,
  CalendarRange,
  ExternalLink,
  KanbanSquare,
  Menu,
  PhoneCall,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Truck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { NavProgress } from "@/components/nav-progress";
import { QuickAdd } from "@/components/quick-add";
import type { QuickAddData } from "@/components/quick-add";
import { Sheet } from "@/components/ui";
import { loadQuickAddData } from "@/server/actions";
import type { Session } from "@/server/auth";
import { recordPage } from "@/lib/nav-history";
import { useKeepWarm } from "@/lib/use-keep-warm";
import { onOpenNewDeal, type DealPrefill } from "@/lib/new-deal";
import { onToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * What each role can reach.
 *
 * Ops are here to put trucks on the road: Deployments, and Settings behind
 * the gear so they can install the app. Everything commercial is refused at
 * the page itself by `requireSales()` — this list only decides what is worth
 * offering, it is not the guard.
 */
const SALES_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/leads", label: "Leads", icon: PhoneCall },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/forecast", label: "Forecast", icon: CalendarRange },
  { href: "/deployments", label: "Deploy", icon: Truck },
];

const PRICING_TOOL_URL = "https://moeving-pricing.vercel.app/";

const OPS_NAV = [{ href: "/deployments", label: "Deployments", icon: Truck }];

/** The desk that answers the phone. Leads in, and nothing else. */
const NOC_NAV = [{ href: "/leads", label: "Leads", icon: PhoneCall }];

/**
 * The four tabs a phone keeps at the bottom.
 *
 * Six tabs plus the Add-deal button on a 390px screen gave each one 56px and
 * a label that had to be read rather than glanced at. These are the screens a
 * deal owner is in and out of all day; Dashboard and Forecast are things you
 * sit down to look at, so they live in the menu and the bottom bar gets its
 * width back.
 */
const PHONE_TABS = ["/leads", "/pipeline", "/deployments"];

const ROLE_LABEL: Record<Session["role"], string> = {
  admin: "Admin",
  sales: "Deal Owner",
  ops: "Operations",
  noc: "NOC",
};

/** Page titles for the mobile header, so it never says "MoEVing" vaguely. */
const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/pipeline": "Pipeline",
  "/forecast": "Forecast",
  "/opportunities": "Deal",
  "/admin/users": "Users",
  "/admin/master-data": "Master data",
  "/admin/cost-defaults": "Cost defaults",
  "/settings": "Settings",
  "/deployments": "Deployments",
  "/leads": "Leads",
};

export function AppShell({
  session,
  leadsAwaiting,
  children,
}: {
  session: Session;
  /** Leads assigned to this person that nobody has rung yet. */
  leadsAwaiting: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [addOpen, setAddOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Keyed, so the same message twice in a row still restarts its timer.
  const [toast, setToast] = React.useState<{ text: string; key: number } | null>(
    null,
  );
  const say = React.useCallback(
    (text: string) => setToast({ text, key: Date.now() }),
    [],
  );
  const [master, setMaster] = React.useState<QuickAddData | null>(null);
  const [refreshing, startRefresh] = React.useTransition();

  // Wakes the database before the next tap needs it (see the hook).
  useKeepWarm();

  /** Re-reads this screen from the server, for when somebody else has moved a deal. */
  const refresh = () => startRefresh(() => router.refresh());

  /**
   * The Add deal sheet's data is fetched the first time it is opened, not
   * carried in the shell of every page. Once fetched it is kept for the rest
   * of the visit, so the sheet only ever waits once.
   */
  React.useEffect(() => {
    if (!addOpen || master) return;
    let live = true;
    loadQuickAddData()
      .then((result) => {
        if (live && result.ok && result.data) setMaster(result.data);
      })
      .catch(() => {
        /* The sheet keeps its frame; pressing + again retries. */
      });
    return () => {
      live = false;
    };
  }, [addOpen, master]);

  // /pipeline?new=1 — the PWA "New deal" shortcut and any deep link.
  // /pipeline?created=N — confirmation after creating several deals at once.
  React.useEffect(() => {
    if (params.get("new") === "1") {
      setAddOpen(true);
      router.replace(pathname);
    }
    const created = Number(params.get("created"));
    if (created > 0) {
      say(`${created} deals created`);
      router.replace(pathname);
    }
  }, [params, pathname, router, say]);

  React.useEffect(() => onToast(say), [say]);

  // Duplicate on a deal's page: the same sheet, filled in with that deal.
  const [prefill, setPrefill] = React.useState<DealPrefill | null>(null);
  React.useEffect(
    () =>
      onOpenNewDeal((p) => {
        setPrefill(p ?? null);
        setAddOpen(true);
      }),
    [],
  );

  // Remembered for the back link on a deal's page.
  const query = params.toString();
  React.useEffect(() => {
    recordPage(query ? `${pathname}?${query}` : pathname);
  }, [pathname, query]);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const isOps = session.role === "ops";
  const isNoc = session.role === "noc";
  // The phone desk gets one screen, the way ops gets one screen: leads in,
  // and nothing about what a deal owner did with them.
  const tabs = isOps ? OPS_NAV : isNoc ? NOC_NAV : SALES_NAV;

  // Settings is everyone's — it is where the install button lives, and the
  // people who most need to install this are the ones who are not admins.
  const nav = [
    ...tabs,
    ...(session.role === "admin"
      ? [{ href: "/admin/users", label: "Admin", icon: Shield }]
      : []),
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  // A tap that goes somewhere should close the menu behind it.
  React.useEffect(() => setMenuOpen(false), [pathname]);

  // What the phone's bottom bar keeps. Ops and NOC have one screen each, so
  // there is nothing to trim for them.
  const phoneTabs =
    isOps || isNoc ? tabs : tabs.filter((t) => PHONE_TABS.includes(t.href));

  const title =
    pathname.startsWith("/forecast") && params.get("tab") === "wins"
      ? "Wins"
      : (Object.entries(TITLES).find(([href]) => pathname.startsWith(href))?.[1] ??
        "Good Deal");

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white px-3 py-5 md:flex">
        <div className="flex items-start justify-between gap-2 pb-6 pl-3">
          <div>
            <Image
              src="/logo-wordmark.png"
              alt="Good Deal"
              width={524}
              height={192}
              priority
              className="h-8 w-auto"
            />
            <p className="mt-1.5 text-xs text-muted">MoEVing sales</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh"
            title="Refresh"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink disabled:opacity-60"
          >
            <RefreshCw size={16} className={cn(refreshing && "animate-spin")} />
          </button>
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
                <span className="flex-1">{item.label}</span>
                {item.href === "/leads" ? <CountBadge n={leadsAwaiting} /> : null}
              </Link>
            );
          })}
        </nav>
        {/* Same rule as the phone's tab bar: ops and NOC do not sell. */}
        {isOps || isNoc ? null : (
          <button
            onClick={() => setAddOpen(true)}
            className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-brand font-medium text-white hover:brightness-95"
          >
            <Plus size={18} /> New deal
          </button>
        )}
        {/* The pricing calculator is a separate app; deal owners quote from
            it, so it sits at the foot of their rail. Not for ops or NOC. */}
        {isOps || isNoc ? null : (
          <a
            href={PRICING_TOOL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-[15px] font-medium text-ink transition hover:bg-canvas"
          >
            <Calculator size={18} strokeWidth={2} />
            <span className="flex-1">Pricing Tool</span>
            <ExternalLink size={14} className="text-muted" />
          </a>
        )}
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2",
            isOps || isNoc ? "mt-auto" : "mt-3",
          )}
        >
          <UserButton />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{session.name}</p>
            <p className="truncate text-xs text-muted">
              {ROLE_LABEL[session.role]}
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Mobile header: one line, the page you are on, and you. */}
        <header className="glass sticky top-0 z-30 border-b border-line/70 md:hidden">
          <div className="flex items-center gap-2 px-2 pb-2.5 pt-3">
            {/* Every page the tab bar no longer has room for. */}
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Menu"
              aria-haspopup="dialog"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink active:bg-canvas"
            >
              <Menu size={22} />
            </button>
            <h1 className="min-w-0 flex-1 truncate text-[22px] font-semibold tracking-[-0.02em]">
              {title}
            </h1>
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-canvas"
            >
              <Settings size={19} />
            </Link>
            <span className="mr-1 flex shrink-0 items-center">
              <UserButton />
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-3 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      {/* Mobile tab bar: the screens a deal owner lives in, plus Add deal.
          Everything else is behind the hamburger. Ops and NOC get their one
          screen and no Add deal — neither of them sells. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div
          className={cn(
            "mx-auto grid max-w-md",
            // The count has to match what is rendered, or the tabs sit off
            // centre: one screen each for ops and NOC, three tabs plus the
            // Add deal button for everyone else.
            isOps || isNoc ? "grid-cols-1" : "grid-cols-4",
          )}
        >
          {phoneTabs.map((item) => (
            <NavTab
              key={item.href}
              {...item}
              pathname={pathname}
              badge={item.href === "/leads" ? leadsAwaiting : 0}
            />
          ))}
          {isOps || isNoc ? null : (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Add deal"
              className="flex flex-col items-center gap-1 py-2 text-[11px] font-semibold text-brand-ink active:scale-95"
            >
              <span className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/40 ring-4 ring-white">
                <Plus size={28} strokeWidth={2.8} />
              </span>
              Add deal
            </button>
          )}
        </div>
      </nav>

      <NavProgress busy={refreshing} />

      {/* The live region is always there and only its text changes: a
          region inserted already holding its message is often not read out.
          Above the sheets, so a confirmation is never hidden by one. */}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex justify-center"
      >
        {toast ? (
          <p
            key={toast.key}
            className="max-w-[92vw] rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            {toast.text}
          </p>
        ) : null}
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Go to">
        <nav className="-my-1">
          <ul className="divide-y divide-line">
            {nav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-[54px] items-center gap-3 text-[15.5px] transition active:opacity-70",
                      active ? "font-semibold text-brand-ink" : "text-ink",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        active ? "bg-brand-soft text-brand-ink" : "bg-canvas text-muted",
                      )}
                    >
                      <item.icon size={18} strokeWidth={active ? 2.5 : 2} />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/leads" ? <CountBadge n={leadsAwaiting} /> : null}
                  </Link>
                </li>
              );
            })}
            {/* The same action the + button performs, named, for anyone who
                came looking for it in a list of pages. */}
            {isOps || isNoc ? null : (
              <li>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setAddOpen(true);
                  }}
                  className="flex h-[54px] w-full items-center gap-3 text-left text-[15.5px] text-ink active:opacity-70"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                    <Plus size={18} strokeWidth={2.5} />
                  </span>
                  Add deal
                </button>
              </li>
            )}
          </ul>
        </nav>
      </Sheet>

      {/* Not even mounted for ops and NOC, so the ?new=1 deep link cannot
          open it for them either. */}
      {isOps || isNoc ? null : (
        <QuickAdd
          open={addOpen}
          onClose={() => {
            setAddOpen(false);
            // The next + opens an empty sheet, not the last duplicate.
            setPrefill(null);
          }}
          prefill={prefill}
          master={master}
          session={session}
        />
      )}
    </div>
  );
}

/** A red count, for work waiting on the person looking at it. */
function CountBadge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      aria-label={`${n} waiting`}
      className={cn(
        "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold leading-none text-white",
        className,
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function NavTab({
  href,
  label,
  icon: Icon,
  pathname,
  badge = 0,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  pathname: string;
  badge?: number;
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
          "relative flex h-7 w-12 items-center justify-center rounded-full transition",
          active && "bg-brand-soft",
        )}
      >
        <Icon size={20} strokeWidth={active ? 2.5 : 2} />
        <CountBadge n={badge} className="absolute -right-1 -top-1.5 ring-2 ring-white" />
      </span>
      {label}
    </Link>
  );
}
