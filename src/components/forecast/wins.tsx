"use client";

import { Building2, IndianRupee, Loader2, Trophy, Truck } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Segmented, Sheet } from "@/components/ui";
import { cn, formatDate, inrCompact, monthLabel, monthLabelLong, num } from "@/lib/utils";
import { loadWinsDrilldown } from "@/server/forecast-actions";
import type { WinCell } from "@/server/queries";

type Row = {
  key: string;
  ownerId: string;
  owner: string;
  cells: WinCell[];
  total: WinCell;
};

type Won = {
  id: string;
  name: string;
  accountName: string;
  city: string | null;
  vehicleType: string | null;
  fleetSize: number;
  revenue: number | null;
  margin: number | null;
  closedAt: Date | null;
};

/**
 * The mirror of the forecast: what actually closed, by whom, in which month.
 * Deals won is the headline — "we closed four accounts in October" is the
 * sentence people say — with fleet and value a tap away.
 */
export function WinsGrid({
  months,
  rows,
  monthTotals,
}: {
  months: string[];
  rows: Row[];
  monthTotals: WinCell[];
}) {
  const [metric, setMetric] = React.useState<"deals" | "fleet" | "value">("deals");
  const [drill, setDrill] = React.useState<{
    owner: string;
    ownerId: string;
    month: string;
  } | null>(null);
  const [items, setItems] = React.useState<Won[] | null>(null);

  React.useEffect(() => {
    if (!drill) return;
    setItems(null);
    let cancelled = false;
    loadWinsDrilldown(drill.ownerId, drill.month).then((r) => {
      if (!cancelled) setItems(r as Won[]);
    });
    return () => {
      cancelled = true;
    };
  }, [drill]);

  const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c[metric])));
  const show = (c: WinCell) =>
    metric === "value"
      ? c.value
        ? inrCompact(c.value)
        : "·"
      : c[metric]
        ? num(c[metric])
        : "·";

  const grand = monthTotals.reduce(
    (a, c) => ({
      deals: a.deals + c.deals,
      fleet: a.fleet + c.fleet,
      value: a.value + c.value,
    }),
    { deals: 0, fleet: 0, value: 0 },
  );

  return (
    <div>
      {/* The same switch the pipeline and forecast use, so "what am I
          measuring" looks identical wherever it is asked. */}
      <Segmented
        label="Measure"
        className="mb-3 md:w-[300px]"
        value={metric}
        onChange={setMetric}
        options={[
          { value: "deals", label: "Accounts", icon: <Building2 size={16} /> },
          { value: "fleet", label: "Vehicles", icon: <Truck size={16} /> },
          { value: "value", label: "Value", icon: <IndianRupee size={16} /> },
        ]}
      />

      <div className="mb-3 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900">
        <Trophy size={18} />
        <span className="tabular text-[19px] font-bold">{num(grand.deals)}</span>
        <span className="text-[13px] opacity-80">
          accounts won · {num(grand.fleet)} vehicles
        </span>
        <span className="tabular ml-auto text-[15px] font-bold">
          {inrCompact(grand.value)}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
          <p className="font-semibold">No wins recorded yet</p>
          <p className="mt-1 text-sm text-muted">
            Deals appear here the month they are moved to Closed Won.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 bg-white py-2.5 pl-3 pr-2 text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                  Owner
                </th>
                {months.map((m) => (
                  <th
                    key={m}
                    className="px-1 py-2.5 text-center text-[12px] font-semibold uppercase tracking-wide text-muted"
                  >
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="hidden py-2.5 pl-1 pr-3 text-right text-[12px] font-semibold uppercase tracking-wide text-muted sm:table-cell">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <th className="sticky left-0 z-10 bg-white py-2 pl-3 pr-1 text-left text-[13px] font-semibold">
                    {r.owner.split(" ")[0]}
                  </th>
                  {r.cells.map((c, i) => (
                    <td key={months[i]} className="p-1 text-center">
                      <button
                        disabled={!c.deals}
                        onClick={() =>
                          setDrill({
                            owner: r.owner,
                            ownerId: r.ownerId,
                            month: months[i]!,
                          })
                        }
                        className={cn(
                          "tabular h-11 w-full min-w-[38px] rounded-lg text-[15px] font-semibold transition",
                          c.deals
                            ? "text-emerald-950 active:ring-2 active:ring-emerald-300"
                            : "cursor-default text-muted/40",
                        )}
                        style={
                          c.deals
                            ? {
                                backgroundColor: `color-mix(in oklab, #059669 ${8 + (c[metric] / max) * 42}%, white)`,
                              }
                            : undefined
                        }
                      >
                        {show(c)}
                      </button>
                    </td>
                  ))}
                  <td className="tabular hidden py-2 pl-1 pr-3 text-right text-[13px] font-bold sm:table-cell">
                    {show(r.total)}
                  </td>
                </tr>
              ))}
              <tr className="bg-canvas">
                <th className="sticky left-0 z-10 bg-canvas py-2.5 pl-3 pr-2 text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                  Total
                </th>
                {monthTotals.map((t, i) => (
                  <td
                    key={months[i]}
                    className="tabular px-1 py-2.5 text-center text-[13px] font-semibold"
                  >
                    {show(t)}
                  </td>
                ))}
                <td className="tabular hidden py-2.5 pl-1 pr-3 text-right text-[13px] font-bold sm:table-cell">
                  {show(grand)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 px-1 text-xs text-muted">
        Closed Won deals, counted in the month they were marked won. Tap a number
        for the accounts behind it.
      </p>

      <Sheet
        open={Boolean(drill)}
        onClose={() => setDrill(null)}
        title={drill ? `${drill.owner} · ${monthLabelLong(drill.month)}` : ""}
      >
        {items === null ? (
          <div className="flex justify-center py-10 text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/opportunities/${w.id}`}
                  className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 active:bg-canvas"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{w.accountName}</p>
                    <p className="truncate text-[13px] text-muted">
                      {w.city ?? "No city"} · {w.fleetSize} × {w.vehicleType ?? "—"} ·{" "}
                      {formatDate(w.closedAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular font-semibold">{inrCompact(w.revenue)}</p>
                    <p className="tabular text-[12px] text-emerald-700">
                      +{inrCompact(w.margin)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
