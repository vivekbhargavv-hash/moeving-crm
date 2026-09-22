"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import Link from "next/link";

import type { StageTarget } from "@/components/stage-changer";
import { Badge } from "@/components/ui-server";
import {
  CHARGING_SCOPE_LABEL,
  DRIVER_TYPE_LABEL,
  STAGE_MAP,
} from "@/lib/constants";
import { cn, formatDate, inr, inrCompact, num } from "@/lib/utils";
import type { OpportunityCard } from "@/server/queries";

type SortKey =
  | "accountName"
  | "stage"
  | "city"
  | "vehicleType"
  | "fleetSize"
  | "price"
  | "value"
  | "totalCost"
  | "marginPct"
  | "ownerName"
  | "expectedCloseDate"
  | "updatedAt";

const COLUMNS: {
  key: SortKey;
  label: string;
  align?: "right";
  /**
   * Held back until the screen is genuinely wide.
   *
   * Twelve columns need about 1,270px and a laptop's content area is nearer
   * 980, so at `lg` the table simply scrolled — and what scrolled off the
   * right was Total cost and Margin %, the two figures the pipeline is read
   * for. These five give way instead, and come back on a large monitor.
   */
  wide?: boolean;
}[] = [
  { key: "accountName", label: "Customer" },
  { key: "stage", label: "Stage" },
  { key: "city", label: "City" },
  { key: "vehicleType", label: "Vehicle" },
  { key: "fleetSize", label: "Fleet", align: "right" },
  // Price per vehicle is Value / mo divided by Fleet, and both are right here.
  { key: "price", label: "Price / veh", align: "right", wide: true },
  { key: "value", label: "Value / mo", align: "right" },
  // Never behind a breakpoint. These two hid below `lg` and then scrolled off
  // the right edge above it, so on a laptop the pipeline's margin was simply
  // not on the screen.
  { key: "totalCost", label: "Total cost", align: "right" },
  { key: "marginPct", label: "Margin %", align: "right" },
  { key: "ownerName", label: "Deal Owner", wide: true },
  { key: "expectedCloseDate", label: "Expected close", align: "right" },
  { key: "updatedAt", label: "Updated", align: "right", wide: true },
];

// The same sorts the desktop table offers by clicking a header, as chips.
// Updated leads because it is the default and the reason to open this screen.
const MOBILE_SORTS: { key: SortKey; label: string }[] = [
  { key: "updatedAt", label: "Updated" },
  { key: "expectedCloseDate", label: "Closing" },
  { key: "value", label: "Value" },
  { key: "fleetSize", label: "Fleet" },
  { key: "accountName", label: "Customer" },
  { key: "stage", label: "Stage" },
];

/**
 * A deal that grew out of an earlier one for the same customer. Worth a mark
 * in the list: repeat business reads as a duplicate row otherwise.
 */
function RepeatMark() {
  return (
    <span
      title="Follow-on deployment for an existing customer"
      className="shrink-0 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700"
    >
      Repeat
    </span>
  );
}

/** Dates and money read best largest-first; names read best A-Z. */
const DESC_FIRST: SortKey[] = [
  "updatedAt",
  "value",
  "fleetSize",
  "price",
  "totalCost",
  "marginPct",
];

/**
 * Every deal in one flat, sortable view.
 *
 * On a phone this is a list, not a shrunken table: a frozen first column plus
 * ten more on a 390px screen leaves a sliver for the data that matters. Each
 * deal gets a full-width row instead, so nothing scrolls sideways. The real
 * table appears from md up, where the width exists to justify it.
 */
/** Rows added per tap of "Show more". */
const PAGE = 40;

export function PipelineList({
  opportunities,
  onStageTap,
}: {
  opportunities: OpportunityCard[];
  onStageTap: (t: StageTarget) => void;
}) {
  const router = useRouter();
  // Most recently touched first: what moved since you last looked is the
  // reason to open the pipeline. Descending, so newest is at the top.
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({
    key: "updatedAt",
    desc: true,
  });
  /**
   * How many rows are actually in the DOM.
   *
   * A phone will happily be handed 600 deals and will then spend a second and
   * a half building 600 cards nobody has scrolled to yet. Sorting and the
   * totals above still run over every row — only the rendering is windowed,
   * so nothing is hidden, it just arrives when it is needed.
   */
  const [shown, setShown] = React.useState(PAGE);

  // A new sort or a new filter means looking again from the top.
  React.useEffect(() => setShown(PAGE), [sort, opportunities]);

  const rows = React.useMemo(() => {
    const stageOrder = Object.fromEntries(
      Object.keys(STAGE_MAP).map((s, i) => [s, i]),
    ) as Record<string, number>;

    const value = (o: OpportunityCard) => {
      switch (sort.key) {
        case "stage":
          return stageOrder[o.stage] ?? 99;
        case "fleetSize":
        case "price":
        case "value":
        case "totalCost":
          return o[sort.key] ?? 0;
        case "marginPct":
          // Only a won deal has a margin. Undefined sorts to the bottom either
          // way rather than pretending to be 0%, which would read as break-even.
          return o.marginPct ?? -Infinity;
        case "updatedAt":
          return new Date(o.updatedAt).getTime();
        case "expectedCloseDate":
          // Undated deals sort last, never first.
          return o.expectedCloseDate
            ? new Date(o.expectedCloseDate).getTime()
            : Number.MAX_SAFE_INTEGER;
        default:
          return (o[sort.key] ?? "").toString().toLowerCase();
      }
    };

    return [...opportunities].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.desc ? -cmp : cmp;
    });
  }, [opportunities, sort]);

  function toggle(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, desc: !s.desc } : { key, desc: DESC_FIRST.includes(key) },
    );
  }

  const totals = rows.reduce(
    (acc, o) => ({
      fleet: acc.fleet + o.fleetSize,
      value: acc.value + o.value,
      // Blended margin is margin over revenue across every costed deal — won
      // or still open, since a deal can be costed at any stage — not the
      // average of their percentages: a 60% margin on one truck must not
      // outweigh a 5% margin on forty. Uncosted deals contribute nothing
      // rather than dragging the blend towards zero.
      costedRevenue: acc.costedRevenue + (o.totalRevenue ?? 0),
      costedMargin: acc.costedMargin + (o.grossMargin ?? 0),
      costedCost: acc.costedCost + (o.totalCost ?? 0),
    }),
    { fleet: 0, value: 0, costedRevenue: 0, costedMargin: 0, costedCost: 0 },
  );
  const blendedMarginPct = totals.costedRevenue
    ? (totals.costedMargin / totals.costedRevenue) * 100
    : null;

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
        <p className="font-semibold">No deals match</p>
        <p className="mt-1 text-sm text-muted">
          Clear the search or filter, or tap + to add one.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ------------------------------------------------- mobile list */}
      <div className="md:hidden">
        <div className="no-scrollbar -mx-4 mb-3 flex items-center gap-2 overflow-x-auto px-4">
          <span className="shrink-0 text-[12px] font-medium text-muted">Sort</span>
          {MOBILE_SORTS.map((c) => {
            const on = sort.key === c.key;
            return (
              <button
                key={c.key}
                onClick={() => toggle(c.key)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-[13px] font-semibold transition",
                  on
                    ? "border-transparent bg-ink text-white"
                    : "border-line bg-white text-muted",
                )}
              >
                {c.label}
                {on ? (
                  sort.desc ? (
                    <ArrowDown size={13} />
                  ) : (
                    <ArrowUp size={13} />
                  )
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mb-2 flex items-center gap-2 px-1 text-[13px]">
          <span className="font-semibold">{rows.length} deals</span>
          <span className="text-muted">· {num(totals.fleet)} vehicles</span>
          <span className="tabular ml-auto font-semibold">
            {inrCompact(totals.value)}
            <span className="font-normal text-muted"> / mo</span>
          </span>
        </div>

        {/* Cost and margin were desktop-only, which meant a phone — the screen
            this app is built for first — could not see either. They are shown
            across whatever has been costed, blended rather than averaged. */}
        {totals.costedRevenue ? (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-[12.5px]">
            <span className="text-muted">Costed deals</span>
            <span className="tabular ml-auto">
              cost{" "}
              <span className="font-semibold text-ink">
                {inrCompact(totals.costedCost)}
              </span>
            </span>
            <span
              className={cn(
                "tabular font-semibold",
                blendedMarginPct !== null && blendedMarginPct < 0
                  ? "text-rose-700"
                  : "text-emerald-700",
              )}
            >
              {blendedMarginPct === null
                ? "—"
                : `${blendedMarginPct.toFixed(1)}% margin`}
            </span>
          </div>
        ) : null}

        <ul className="space-y-2">
          {rows.slice(0, shown).map((o) => {
            const stage = STAGE_MAP[o.stage];
            return (
              <li
                key={o.id}
                className="relative overflow-hidden rounded-2xl border border-line bg-white"
              >
                <span className={cn("absolute inset-y-0 left-0 w-1", stage.dot)} />
                <Link href={`/opportunities/${o.id}`} className="block py-3 pl-4 pr-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="flex min-w-0 items-baseline gap-1.5 text-[15px] font-semibold">
                      <span className="truncate">{o.accountName}</span>
                      {o.parentOpportunityId ? <RepeatMark /> : null}
                    </p>
                    <p className="tabular shrink-0 text-[15px] font-bold">
                      {o.value ? inrCompact(o.value) : "—"}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[13px] text-muted">
                    <span className="truncate">
                      {o.city ?? "No city"} · {o.fleetSize} × {o.vehicleType ?? "—"}
                    </span>
                    {/* Show the field being sorted on, or the ordering is
                        invisible: a list by Updated that displays close dates
                        just looks shuffled. */}
                    <span className="tabular ml-auto shrink-0">
                      {sort.key === "updatedAt"
                        ? `Updated ${formatDate(o.updatedAt)}`
                        : formatDate(o.expectedCloseDate)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onStageTap({
                          id: o.id,
                          name: o.accountName,
                          stage: o.stage,
                          value: o.value,
                          price: o.price,
                          fleetSize: o.fleetSize,
                        });
                      }}
                      className="active:opacity-70"
                    >
                      <Badge className={cn(stage.chip, "px-2.5 py-1 text-[12px]")}>
                        {stage.label}
                      </Badge>
                    </button>
                    {/* A costed deal says what it costs and what it earns.
                        An uncosted one says nothing rather than printing a
                        zero that reads as break-even. */}
                    {o.totalCost ? (
                      <span className="tabular text-[12px] text-muted">
                        cost {inrCompact(o.totalCost)}
                      </span>
                    ) : null}
                    {o.marginPct === null ? null : (
                      <span
                        className={cn(
                          "tabular text-[12px] font-semibold",
                          o.marginPct < 0 ? "text-rose-700" : "text-emerald-700",
                        )}
                      >
                        {o.marginPct.toFixed(1)}%
                      </span>
                    )}
                    <span className="ml-auto text-[12px] text-muted">
                      {o.ownerName.split(" ")[0]}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {rows.length > shown ? (
          <button
            onClick={() => setShown((n) => n + PAGE)}
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-white text-[14px] font-semibold text-brand-ink active:bg-canvas"
          >
            Show {Math.min(PAGE, rows.length - shown)} more
            <span className="ml-1 font-normal text-muted">
              ({rows.length - shown} left)
            </span>
          </button>
        ) : null}
      </div>

      {/* ---------------------------------------------------- desktop table */}
      <div className="hidden overflow-x-auto rounded-[14px] border border-line bg-white md:block">
      <table className="w-full min-w-[860px] border-collapse text-sm 2xl:min-w-[1180px]">
        <thead>
          <tr className="border-b border-line bg-canvas/60">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide text-muted",
                  c.align === "right" && "text-right",
                  c.wide && "hidden 2xl:table-cell",
                  c.key === "accountName" &&
                    "sticky left-0 z-10 bg-canvas/60 backdrop-blur",
                )}
              >
                <button
                  onClick={() => toggle(c.key)}
                  className={cn(
                    "inline-flex items-center gap-1 hover:text-ink",
                    c.align === "right" && "flex-row-reverse",
                  )}
                >
                  {c.label}
                  {sort.key === c.key ? (
                    sort.desc ? (
                      <ArrowDown size={13} />
                    ) : (
                      <ArrowUp size={13} />
                    )
                  ) : (
                    <ChevronsUpDown size={13} className="opacity-30" />
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, shown).map((o) => {
            const stage = STAGE_MAP[o.stage];
            return (
              <tr
                key={o.id}
                onClick={() => router.push(`/opportunities/${o.id}`)}
                className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas/70"
              >
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2.5 font-medium">
                  <span className="flex max-w-40 items-baseline gap-1.5">
                    <span className="truncate">{o.accountName}</span>
                    {o.parentOpportunityId ? <RepeatMark /> : null}
                  </span>
                  {o.name !== o.accountName ? (
                    <span className="block max-w-40 truncate text-[12px] text-muted">
                      {o.name}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStageTap({
                        id: o.id,
                        name: o.accountName,
                        stage: o.stage,
                        value: o.value,
                        price: o.price,
                        fleetSize: o.fleetSize,
                      });
                    }}
                    title="Move stage"
                  >
                    <Badge className={cn(stage.chip, "whitespace-nowrap hover:ring-2 hover:ring-line")}>
                      {stage.label}
                    </Badge>
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{o.city ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {o.vehicleType ?? "—"}
                  <span className="block max-w-36 truncate text-[12px] text-muted">
                    {[
                      o.driverType ? DRIVER_TYPE_LABEL[o.driverType] : null,
                      o.chargingScope
                        ? `${CHARGING_SCOPE_LABEL[o.chargingScope]} charging`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </td>
                <td className="tabular px-3 py-2.5 text-right">{o.fleetSize}</td>
                <td className="tabular hidden px-3 py-2.5 text-right text-muted 2xl:table-cell">
                  {o.price ? inr(o.price) : "—"}
                </td>
                <td className="tabular px-3 py-2.5 text-right font-semibold">
                  {o.value ? inrCompact(o.value) : "—"}
                </td>
                <td className="tabular px-3 py-2.5 text-right text-muted">
                  {/* Any costed deal, not only a won one: the sheet can be
                      filled in at any stage now, and a deal nobody has costed
                      is the one that reads as a dash. */}
                  {o.totalCost ? inrCompact(o.totalCost) : "—"}
                </td>
                <td
                  className={cn(
                    "tabular px-3 py-2.5 text-right font-medium",
                    o.marginPct === null
                      ? "text-muted"
                      : o.marginPct >= 0
                        ? "text-emerald-700"
                        : "text-rose-700",
                  )}
                >
                  {o.marginPct === null ? "—" : `${o.marginPct.toFixed(1)}%`}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 2xl:table-cell">{o.ownerName}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">
                  {formatDate(o.expectedCloseDate)}
                </td>
                <td className="tabular hidden px-3 py-2.5 text-right text-muted 2xl:table-cell">
                  {formatDate(o.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {/* One cell per column, in the same order as COLUMNS. The totals row
              used to close two hidden columns with a single colSpan and then
              print the blended margin in the next cell along — which put it
              under Deal Owner and left Total cost with no total at all. */}
          <tr className="border-t border-line bg-canvas/60 font-semibold">
            {/* Customer */}
            <td className="sticky left-0 z-10 bg-canvas/60 px-3 py-2.5">
              {rows.length > shown ? `${shown} of ${rows.length}` : rows.length}{" "}
              deals
            </td>
            {/* Stage · City · Vehicle */}
            <td colSpan={3} />
            {/* Fleet */}
            <td className="tabular px-3 py-2.5 text-right">{num(totals.fleet)}</td>
            {/* Price / veh — an average price would mean nothing here. */}
            <td className="hidden 2xl:table-cell" />
            {/* Value / mo */}
            <td className="tabular px-3 py-2.5 text-right">
              {inrCompact(totals.value)}
            </td>
            {/* Total cost, across the deals anybody has costed. */}
            <td className="tabular px-3 py-2.5 text-right">
              {totals.costedCost ? inrCompact(totals.costedCost) : ""}
            </td>
            {/* Margin % — blended, not an average of percentages. */}
            <td className="tabular px-3 py-2.5 text-right">
              {blendedMarginPct === null ? "" : `${blendedMarginPct.toFixed(1)}%`}
            </td>
            {/* Deal Owner */}
            <td className="hidden 2xl:table-cell" />
            {/* Expected close */}
            <td />
            {/* Updated */}
            <td className="hidden 2xl:table-cell" />
          </tr>
        </tfoot>
      </table>
      {rows.length > shown ? (
        <button
          onClick={() => setShown((n) => n + PAGE)}
          className="w-full border-t border-line bg-white py-3 text-sm font-semibold text-brand-ink hover:bg-canvas"
        >
          Show {Math.min(PAGE, rows.length - shown)} more of {rows.length}
        </button>
      ) : null}
      </div>
    </>
  );
}
