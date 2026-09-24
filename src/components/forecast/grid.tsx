"use client";

import { ChevronRight, IndianRupee, Loader2, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Badge, Button, Picker, Segmented, Sheet } from "@/components/ui";
import type { PickerOption } from "@/components/ui";
import { startNavigation } from "@/lib/busy";
import { STAGES, STAGE_MAP } from "@/lib/constants";
import type { SalesStage } from "@/db/schema";
import { cn, formatDate, inrCompact, monthLabel, monthLabelLong, num } from "@/lib/utils";
import { loadDrilldown } from "@/server/forecast-actions";

const FIELD = "h-11 w-full min-w-0 rounded-xl px-2 text-[12px] font-medium";
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

/** The deals a city expects to close in one month. */
type MonthDeals = { month: string; items: OpportunityCard[] };

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
  const [clients, setClients] = React.useState<MonthDeals[] | null>(null);

  /**
   * Expanding a city asks for the same drill-down data, a month at a time,
   * across the whole window.
   *
   * The month each answer came from is kept rather than flattened away: this
   * is a forecast, so "who closes in November" is the question, and a single
   * list sorted by fleet size answered a different one.
   */
  React.useEffect(() => {
    if (!expanded) return;
    setClients(null);
    const row = rows.find((r) => r.key === expanded);
    if (!row) return;
    let cancelled = false;
    Promise.all(
      months.map((m) =>
        loadDrilldown(row.cityId, m, filters).then((groups) => ({
          month: m,
          items: (groups as Group[])
            .flatMap((g) => g.items)
            // Biggest first inside a month: the deal that moves the number.
            .sort((a, b) => b.fleetSize - a.fleetSize),
        })),
      ),
    ).then((all) => {
      if (cancelled) return;
      setClients(all.filter((m) => m.items.length > 0));
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
                        // A bare "12" says nothing without the row and column
                        // a sighted reader gets from the grid around it.
                        aria-label={`${r.city}, ${monthLabelLong(months[i]!)}: ${
                          c.count
                            ? `${show(c)} ${metric === "fleet" ? "vehicles" : "a month"}, ${c.count} ${c.count === 1 ? "deal" : "deals"}`
                            : "nothing closing"
                        }`}
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
                      <div className="space-y-3">
                        {clients.map((m) => (
                          <div key={m.month}>
                            {/* The month is the heading, because a forecast is
                                read a month at a time. */}
                            <div className="flex items-baseline gap-2 border-b border-line pb-1">
                              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                                {monthLabelLong(m.month)}
                              </p>
                              <p className="tabular ml-auto text-[12px] text-muted">
                                {num(m.items.reduce((a, o) => a + o.fleetSize, 0))}{" "}
                                veh ·{" "}
                                {inrCompact(m.items.reduce((a, o) => a + o.value, 0))}
                              </p>
                            </div>
                            <ul className="divide-y divide-line">
                              {m.items.map((o) => (
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
                          </div>
                        ))}
                      </div>
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
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  function setParam(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    // A router navigation, not a full page load: the shell and the tab bar
    // stay put instead of the whole app being thrown away and rebuilt.
    startNavigation(url.pathname + url.search);
    startTransition(() => router.push(url.pathname + url.search, { scroll: false }));
  }

  const all = (label: string, rows: { id: string; name: string }[]): PickerOption[] => [
    { value: "", label },
    ...rows.map((r) => ({ value: r.id, label: r.name })),
  ];

  return (
    /* Two rows, not one scroller. As a single row these four controls came to
       528px on a 390px screen: the last one sat half off the edge looking
       broken, and a row wider than the screen stretches the layout viewport,
       which is what makes the fixed tab bar change width between pages. */
    <div className="mb-4 space-y-2">
      {/* Full width on a phone, a sized switch on desktop: a bordered bar
          stretched across a wide screen stops reading as a control. */}
      <Segmented
        label="Measure"
        className="md:w-[220px]"
        value={metric}
        onChange={setMetric}
        options={[
          { value: "fleet", label: "Vehicles", icon: <Truck size={16} /> },
          { value: "value", label: "Value", icon: <IndianRupee size={16} /> },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
      <Picker
        label="City"
        className={FIELD}
        value={filters.cityId ?? ""}
        onChange={(v) => setParam("city", v)}
        options={all("All cities", options.cities)}
      />
      <Picker
        label="Vehicle type"
        className={FIELD}
        value={filters.vehicleTypeId ?? ""}
        onChange={(v) => setParam("vehicle", v)}
        options={all("All vehicles", options.vehicleTypes)}
      />
      <Picker
        label="Deal owner"
        className={FIELD}
        value={filters.ownerUserId ?? ""}
        onChange={(v) => setParam("spoc", v)}
        options={all("All owners", options.users)}
      />
      <StagePicker
        className={FIELD}
        selected={filters.stages ?? []}
        onChange={(next) => setParam("stage", next.join(","))}
      />
      </div>
    </div>
  );
}


/**
 * Stage, as several answers rather than one.
 *
 * "How does Negotiation plus Contracting look this quarter" is the question
 * this page is usually opened with, and a single-value dropdown could not be
 * asked it. Chips in a sheet, like the pipeline's filter, rather than a
 * multi-select box: a native select sizes itself to its longest option and
 * stretches the layout viewport on a phone.
 */
function StagePicker({
  selected,
  onChange,
  className,
}: {
  selected: SalesStage[];
  onChange: (next: SalesStage[]) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const openStages = STAGES.filter((s) => s.open);

  const label =
    selected.length === 0
      ? "All open stages"
      : selected.length === 1
        ? STAGE_MAP[selected[0]!].label
        : `${selected.length} stages`;

  function toggle(stage: SalesStage) {
    onChange(
      selected.includes(stage)
        ? selected.filter((v) => v !== stage)
        : [...selected, stage],
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center justify-between gap-1 border bg-white text-left",
          selected.length
            ? "border-brand bg-brand-soft text-brand-ink"
            : "border-line text-ink",
          className,
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronRight size={14} className="shrink-0 rotate-90 opacity-50" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Stage">
        <div className="flex flex-wrap gap-2">
          {openStages.map((s) => {
            const on = selected.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.value)}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition active:scale-[0.98]",
                  on
                    ? "border-brand bg-brand-soft text-brand-ink"
                    : "border-line bg-white text-muted",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                {s.label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Pick none to see every open stage. Closed deals are never in the
          forecast — won ones are in Wins.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!selected.length}
            onClick={() => onChange([])}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="brand"
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </Sheet>
    </>
  );
}
