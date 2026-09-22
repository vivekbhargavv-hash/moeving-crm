"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/master-data", label: "Master data" },
  { href: "/admin/cost-defaults", label: "Cost defaults" },
];

/**
 * Admin's pages.
 *
 * These were plain outlined pills with no active state, so both looked
 * identical and the screen never told you which one you were on. Same switch
 * as everywhere else now, and it says.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div
        role="tablist"
        aria-label="Admin section"
        className="mx-auto mb-4 flex h-12 max-w-3xl rounded-xl border border-line bg-white p-[3px] md:h-11"
      >
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              role="tab"
              aria-selected={active}
              className={cn(
                "flex h-full flex-1 items-center justify-center rounded-lg px-1 text-center text-[13px] font-semibold leading-tight transition sm:text-[13.5px]",
                active
                  ? "bg-ink text-white"
                  : "text-muted hover:bg-canvas hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
