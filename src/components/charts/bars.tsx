"use client";

import { cn, inrCompact, num } from "@/lib/utils";

/**
 * Charts here are plain HTML bars rather than a charting library: the four
 * views on this dashboard are all "magnitude by category", they must survive a
 * 360px screen, and a 100KB bundle buys nothing a div can't do.
 *
 * Colour follows the dataviz method — one hue per chart (single series needs no
 * legend), an ordinal blue ramp for the funnel's ordered stages, text in ink
 * tokens rather than the series colour, and direct value labels instead of an
 * axis to read against.
 */

const SERIES = "#2a78d6";

/** Ordinal ramp, light → dark, never lighter than step 250 on a light surface. */
export const FUNNEL_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];

export type BarDatum = {
  label: string;
  value: number;
  secondary?: string;
  color?: string;
};

export function BarList({
  data,
  format = "value",
  emptyLabel = "No data yet",
  max: fixedMax,
}: {
  data: BarDatum[];
  format?: "value" | "count";
  emptyLabel?: string;
  max?: number;
}) {
  if (!data.length) {
    return <p className="px-4 py-8 text-center text-sm text-muted">{emptyLabel}</p>;
  }
  const max = fixedMax ?? Math.max(...data.map((d) => d.value), 1);
  const fmt = (v: number) => (format === "value" ? inrCompact(v) : num(v));

  return (
    <ul className="space-y-2.5 px-4 pb-4">
      {data.map((d) => (
        <li key={d.label} className="group">
          <div className="flex items-baseline justify-between gap-3 pb-1">
            <span className="truncate text-[13px] font-medium text-ink">
              {d.label}
            </span>
            <span className="tabular shrink-0 text-[13px] font-semibold text-ink">
              {fmt(d.value)}
              {d.secondary ? (
                <span className="ml-1.5 font-normal text-muted">{d.secondary}</span>
              ) : null}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-canvas"
            title={`${d.label}: ${fmt(d.value)}`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                backgroundColor: d.color ?? SERIES,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Ordered stages, widest first — the shape carries the meaning. */
export function Funnel({
  data,
}: {
  data: { label: string; count: number; fleet: number; value: number }[];
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ul className="space-y-2 px-4 pb-4">
      {data.map((d, i) => (
        <li key={d.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-[13px] font-medium text-ink">
            {d.label}
          </span>
          <div className="flex-1">
            <div
              className={cn(
                "flex h-8 items-center rounded-lg px-2.5 transition-[width] duration-500",
                d.count ? "" : "bg-canvas",
              )}
              style={{
                width: `${Math.max(d.count ? 14 : 6, (d.count / max) * 100)}%`,
                backgroundColor: d.count ? FUNNEL_RAMP[i] ?? FUNNEL_RAMP[4] : undefined,
              }}
              title={`${d.label}: ${d.count} deals, ${d.fleet} vehicles, ${inrCompact(d.value)}/mo`}
            >
              <span
                className={cn(
                  "tabular text-[12px] font-bold",
                  i >= 2 ? "text-white" : "text-[#0d366b]",
                )}
              >
                {d.count}
              </span>
            </div>
          </div>
          <span className="tabular w-20 shrink-0 text-right text-[13px] text-muted">
            {d.fleet ? `${num(d.fleet)} veh` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
