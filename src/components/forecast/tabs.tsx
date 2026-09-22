"use client";

import { CalendarRange, Trophy } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** Two views of the same question — what will close, and what did. */
export function ForecastTabs({ active }: { active: "forecast" | "wins" }) {
  const tabs = [
    { key: "forecast", href: "/forecast", label: "Forecast", icon: CalendarRange },
    { key: "wins", href: "/forecast?tab=wins", label: "Wins", icon: Trophy },
  ] as const;

  return (
    // Same shape as every other switch in the app, but built from links so
    // each view keeps its own URL and the back button works.
    <div
      role="tablist"
      aria-label="Forecast view"
      className="mb-3 flex rounded-xl bg-canvas p-1 md:h-11 md:w-[280px] md:border md:border-line md:bg-white md:p-[3px]"
    >
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={active === t.key}
          className={cn(
            "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[13.5px] font-semibold transition md:h-full md:rounded-lg md:text-sm",
            active === t.key
              ? "bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)] md:bg-ink md:text-white md:shadow-none"
              : "text-muted md:hover:bg-canvas md:hover:text-ink",
          )}
        >
          <t.icon size={15} />
          {t.label}
        </Link>
      ))}
    </div>
  );
}
