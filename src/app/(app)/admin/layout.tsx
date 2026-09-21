"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/master-data", label: "Master data" },
];

/**
 * Admin's two pages.
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
        className="mx-auto mb-4 flex max-w-3xl rounded-xl bg-canvas p-1"
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
                "flex h-10 flex-1 items-center justify-center rounded-[10px] text-[13.5px] font-semibold transition",
                active
                  ? "bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]"
                  : "text-muted",
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
