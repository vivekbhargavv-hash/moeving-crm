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
    <div className="mb-3 flex h-12 rounded-2xl border border-line bg-white p-[3px]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "flex h-full flex-1 items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold transition",
            active === t.key ? "bg-ink text-white" : "text-muted",
          )}
        >
          <t.icon size={16} />
          {t.label}
        </Link>
      ))}
    </div>
  );
}
