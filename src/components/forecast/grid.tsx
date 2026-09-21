"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Badge, Segmented, Select, Sheet } from "@/components/ui";
import { STAGES, STAGE_MAP } from "@/lib/constants";
import type { SalesStage } from "@/db/schema";
import { cn, formatDate, inrCompact, monthLabel, monthLabelLong, num } from "@/lib/utils";
import { loadDrilldown } from "@/server/forecast-actions";
import type { ForecastCell, OpportunityCard, OpportunityFilters } from "@/server/queries";

type Row = {
  key: string;
  cityId: string | null;
  city: string;
  cells: ForecastCell[];
  total: ForecastCell;
};

type Group = {
  vehicleType: string;
  fleet: number;
  value: number;
  items: OpportunityCard[];
};

export function ForecastGrid({
  months,
  rows,
  monthTotals,
  filters,
  options,
}: {
  months: string[];
  rows: Row[];
  monthTotals: ForecastCell[];
  filters: OpportunityFilters;
  options: {
    cities: { id: string; name: string }[];
    vehicleTypes: { id: string; name: string }[];
    users: { id: string; name: string }[];
  };
}) {
  const [metric, setMetric] = React.useState<"fleet" | "value">("fleet");
  const [drill, setDrill] = React.useState<{
    city: string;
    cityId: string | null;
    month: string;
  } | null>(null);
  const [groups, setGroups] = React.useState<Group[] | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [clients, setClients] = React.useState<Group[] | null>(null);

  // Expanding a city asks for the same drill-down data, without a month filter:
  // every client expected to close in the window shown.
  React.useEffect(() => {
    if (!expanded) return;
    setClients(null);
    const row = rows.find((r) => r.key === expanded);
    if (!row) return;
    let cancelled = false;
    Promise.all(
      months.map((m) => loadDrilldown(row.cityId, m, filters)),
    ).then((all) => {
      if (cancelled) return;
      setClients(all.flat() as Group[]);
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, months, rows, filters]);

  React.useEffect(() => {
    if (!drill) return;
    setGroups(null);
    setOpen(null);
    let cancelled = false;
    loadDrilldown(drill.cityId, drill.month, filters).then((result) => {
      if (!cancelled) setGroups(result as Group[]);
    });
    return () => {
      cancelled = true;
    };
  }, [drill, filters]);

  const max = Math.max(
    1,
    ...rows.flatMap((r) => r.cells.map((c) => (metric === "fleet" ? c.fleet : c.value))),
  );

  const show = (c: ForecastCell) =>
    metric === "fleet"
      ? c.fleet
        ? num(c.fleet)
        : "·"
      : c.value
        ? inrCompact(c.value)
        : "·";

  return (
    <div>
      <FilterBar filters={filters} options={options} metric={metric} setMetric={setMetric} />

      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 rounded-r-[14px] bg-gradient-to-l from-white to-transparent sm:hidden"
        />
        <div className="no-scrollbar overflow-x-auto rounded-[14px] border border-line bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-white py-2.5 pl-3 pr-1 text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                City
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className="px-1 py-2.5 text-center text-[12px] font-semibold uppercase tracking-wide text-muted"
                >
                  {monthLabel(m)}
                </th>
              ))}
              <th className="hidden px-3 py-3 text-right text-[13px] font-semibold uppercase tracking-wide text-muted sm:table-cell">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <React.Fragment key={r.key}>
              <tr className="border-b border-line last:border-0">
                <th className="sticky left-0 z-10 bg-white py-2 pl-3 pr-1 text-left text-[13px] font-semibold">
                  <button
                    onClick={() => setExpanded(expanded === r.key ? null : r.key)}
                    className="flex h-11 items-center gap-1 text-left active:opacity-70"
                    aria-expanded={expanded === r.key}
                  >
                    <ChevronRight
                      size={14}
                      className={cn(
                        "shrink-0 text-muted transition",
                        expanded === r.key && "rotate-90",
                      )}
                    />
                    {r.city}
                  </button>
                </th>
                {r.cells.map((c, i) => {
                  const n = metric === "fleet" ? c.fleet : c.value;
                  const intensity = n / max;
                  return (
                    <td key={months[i]} className="p-1 text-center">
                      <button
                        disabled={!c.count}
                        onClick={() =>
                          setDrill({ city: r.city, cityId: r.cityId, month: months[i]! })
                        }
                        className={cn(
                          "tabular h-11 w-full min-w-[42px] rounded-lg text-[15px] font-semibold transition",
                          c.count
                            ? "hover:ring-2 hover:ring-brand/30"
                            : "cursor-default text-muted/40",
                        )}
                        style={
                          c.count
                            ? {
                                backgroundColor: `color-mix(in oklab, var(--color-brand) ${8 + intensity * 42}%, white)`,
                              }
                            : undefined
                        }
                      >
                        {show(c)}
                      </button>
                    </td>
                  );
                })}
                <td className="tabular hidden py-2 pl-1 pr-3 text-right text-[13px] font-bold sm:table-cell">
                  {show(r.total)}
                </td>
              </tr>
              {expanded === r.key ? (
                <tr className="border-b border-line bg-canvas/60">
                  <td colSpan={months.length + 2} className="p-0">
                    <div className="sticky left-0 w-[calc(100vw-2.5rem)] px-3 py-2 sm:w-auto">
                    {clients === null ? (
                      <p className="py-2 text-[13px] text-muted">Loading clients…</p>
                    ) : clients.length === 0 ? (
                      <p className="py-2 text-[13px] text-muted">
                        No open deals in this window.
                      </p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {clients
                          .flatMap((g) => g.items)
                          .sort((a, b) => b.fleetSize - a.fleetSize)
                          .map((o) => (
                            <li key={o.id}>
                              <Link
                                href={`/opportunities/${o.id}`}
                                className="flex items-center gap-2 py-2.5 active:opacity-70"
                              >
                                <span
                                  className={cn(
                                    "h-2 w-2 shrink-0 rounded-full",
                                    STAGE_MAP[o.stage as SalesStage].dot,
                                  )}
                                />
                                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                                  {o.accountName}
                                </span>
                                <span className="tabular shrink-0 text-[13px] text-muted">
                                  {o.fleetSize} × {o.vehicleType ?? "—"}
                                </span>
                                <span className="tabular w-[72px] shrink-0 whitespace-nowrap text-right text-[13px] font-semibold">
                                  {formatDate(o.expectedCloseDate)}
                                </span>
                              </Link>
                            </li>
                          ))}
                      </ul>
                    )}
                    </div>
                  </td>
                </tr>
              ) : null}
              </React.Fragment>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={months.length + 2} className="px-4 py-10 text-center text-muted">
                  No open deals with an expected closing date in this window.
                </td>
              </tr>
            ) : (
              <tr className="bg-canvas">
                <th className="sticky left-0 z-10 bg-canvas py-2.5 pl-3 pr-1 text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                  Total
                </th>
                {monthTotals.map((t, i) => (
                  <td key={months[i]} className="tabular px-1 py-2.5 text-center text-[13px] font-semibold">
                    {show(t)}
                  </td>
                ))}
                <td className="tabular hidden py-2.5 pl-1 pr-3 text-right text-[13px] font-bold sm:table-cell">
                  {show(
                    monthTotals.reduce(
                      (a, c) => ({
                        fleet: a.fleet + c.fleet,
                        value: a.value + c.value,
                        count: a.count + c.count,
                      }),
                      { fleet: 0, value: 0, count: 0 },
                    ),
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-[11.5px] text-muted sm:hidden">
        Swipe the grid sideways for later months.
      </p>

      <p className="mt-3 px-1 text-xs text-muted">
        Open deals only, placed in the month of their expected closing date.
        {metric === "fleet" ? " Numbers are vehicles." : " Numbers are monthly value."}
      </p>

      <Sheet
        open={Boolean(drill)}
        onClose={() => setDrill(null)}
        title={drill ? `${drill.city} · ${monthLabelLong(drill.month)}` : ""}
      >
        {groups === null ? (
          <div className="flex justify-center py-10 text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <p className="py-10 text-center text-muted">Nothing here.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <div key={g.vehicleType} className="rounded-xl border border-line">
                <button
                  onClick={() => setOpen(open === g.vehicleType ? null : g.vehicleType)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <ChevronRight
                    size={16}
                    className={cn(
                      "shrink-0 text-muted transition",
                      open === g.vehicleType && "rotate-90",
                    )}
                  />
                  <span className="font-medium">{g.vehicleType}</span>
                  <span className="tabular ml-auto font-semibold">{g.fleet}</span>
                  <span className="tabular w-20 text-right text-sm text-muted">
                    {inrCompact(g.value)}
                  </span>
                </button>
                {open === g.vehicleType ? (
                  <ul className="border-t border-line">
                    {g.items.map((o) => (
                      <li key={o.id}>
                        <Link
                          href={`/opportunities/${o.id}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-canvas"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{o.accountName}</p>
                            <p className="truncate text-[13px] text-muted">
                              {o.ownerName.split(" ")[0]} ·{" "}
                              {formatDate(o.expectedCloseDate)}
                            </p>
                          </div>
                          <Badge className={STAGE_MAP[o.stage as SalesStage].chip}>
                            {STAGE_MAP[o.stage as SalesStage].short}
                          </Badge>
                          <span className="tabular w-12 text-right font-semibold">
                            {o.fleetSize}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function FilterBar({
  filters,
  options,
  metric,
  setMetric,
}: {
  filters: OpportunityFilters;
  options: {
    cities: { id: string; name: string }[];
    vehicleTypes: { id: string; name: string }[];
    users: { id: string; name: string }[];
  };
  metric: "fleet" | "value";
  setMetric: (m: "fleet" | "value") => void;
}) {
  function setParam(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.location.href = url.toString();
  }

  return (
    /* Two rows, not one scroller. As a single row these four controls came to
       528px on a 390px screen: the last one sat half off the edge looking
       broken, and a row wider than the screen stretches the layout viewport,
       which is what makes the fixed tab bar change width between pages. */
    <div className="mb-4 space-y-2">
      <Segmented
        label="Measure"
        value={metric}
        onChange={setMetric}
        options={[
          { value: "fleet", label: "Vehicles" },
          { value: "value", label: "Value" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
      <Select
        className="h-11 w-full min-w-0 rounded-xl px-2.5 text-[12.5px] font-medium"
        value={filters.cityId ?? ""}
        onChange={(e) => setParam("city", e.target.value)}
      >
        <option value="">All cities</option>
        {options.cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        className="h-11 w-full min-w-0 rounded-xl px-2.5 text-[12.5px] font-medium"
        value={filters.vehicleTypeId ?? ""}
        onChange={(e) => setParam("vehicle", e.target.value)}
      >
        <option value="">All vehicles</option>
        {options.vehicleTypes.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </Select>
      <Select
        className="h-11 w-full min-w-0 rounded-xl px-2.5 text-[12.5px] font-medium"
        value={filters.ownerUserId ?? ""}
        onChange={(e) => setParam("spoc", e.target.value)}
      >
        <option value="">All owners</option>
        {options.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <Select
        className="h-11 w-full min-w-0 rounded-xl px-2.5 text-[12.5px] font-medium"
        value={filters.stage ?? ""}
        onChange={(e) => setParam("stage", e.target.value)}
      >
        <option value="">All open stages</option>
        {STAGES.filter((s) => s.open).map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      </div>
    </div>
  );
}
