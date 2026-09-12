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
  | "ownerName"
  | "expectedCloseDate"
  | "updatedAt";

const COLUMNS: {
  key: SortKey;
  label: string;
  align?: "right";
  /** Hidden on phones, where horizontal room is scarce. */
  wide?: boolean;
}[] = [
  { key: "accountName", label: "Customer" },
  { key: "stage", label: "Stage" },
  { key: "city", label: "City" },
  { key: "vehicleType", label: "Vehicle" },
  { key: "fleetSize", label: "Fleet", align: "right" },
  { key: "price", label: "Price / veh", align: "right" },
  { key: "value", label: "Value / mo", align: "right" },
  { key: "totalCost", label: "Total cost", align: "right", wide: true },
  { key: "ownerName", label: "Deal Owner", wide: true },
  { key: "expectedCloseDate", label: "Expected close", align: "right" },
  { key: "updatedAt", label: "Updated", align: "right", wide: true },
];

const MOBILE_SORTS: { key: SortKey; label: string }[] = [
  { key: "expectedCloseDate", label: "Closing" },
  { key: "value", label: "Value" },
  { key: "fleetSize", label: "Fleet" },
  { key: "accountName", label: "Customer" },
  { key: "stage", label: "Stage" },
];

/**
 * Every deal in one flat, sortable view.
 *
 * On a phone this is a list, not a shrunken table: a frozen first column plus
 * ten more on a 390px screen leaves a sliver for the data that matters. Each
 * deal gets a full-width row instead, so nothing scrolls sideways. The real
 * table appears from md up, where the width exists to justify it.
 */
export function PipelineList({
  opportunities,
  onStageTap,
}: {
  opportunities: OpportunityCard[];
  onStageTap: (t: StageTarget) => void;
}) {
  const router = useRouter();
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({
    key: "expectedCloseDate",
    desc: false,
  });

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
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: false }));
  }

  const totals = rows.reduce(
    (acc, o) => ({
      fleet: acc.fleet + o.fleetSize,
      value: acc.value + o.value,
    }),
    { fleet: 0, value: 0 },
  );

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

        <ul className="space-y-2">
          {rows.map((o) => {
            const stage = STAGE_MAP[o.stage];
            return (
              <li
                key={o.id}
                className="relative overflow-hidden rounded-2xl border border-line bg-white"
              >
                <span className={cn("absolute inset-y-0 left-0 w-1", stage.dot)} />
                <Link href={`/opportunities/${o.id}`} className="block py-3 pl-4 pr-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[15px] font-semibold">
                      {o.accountName}
                    </p>
                    <p className="tabular shrink-0 text-[15px] font-bold">
                      {o.value ? inrCompact(o.value) : "—"}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[13px] text-muted">
                    <span className="truncate">
                      {o.city ?? "No city"} · {o.fleetSize} × {o.vehicleType ?? "—"}
                    </span>
                    <span className="tabular ml-auto shrink-0">
                      {formatDate(o.expectedCloseDate)}
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
                    <span className="ml-auto text-[12px] text-muted">
                      {o.ownerName.split(" ")[0]}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---------------------------------------------------- desktop table */}
      <div className="hidden overflow-x-auto rounded-[14px] border border-line bg-white md:block">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas/60">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide text-muted",
                  c.align === "right" && "text-right",
                  c.wide && "hidden lg:table-cell",
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
          {rows.map((o) => {
            const stage = STAGE_MAP[o.stage];
            return (
              <tr
                key={o.id}
                onClick={() => router.push(`/opportunities/${o.id}`)}
                className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas/70"
              >
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2.5 font-medium">
                  <span className="block max-w-44 truncate">{o.accountName}</span>
                  {o.name !== o.accountName ? (
                    <span className="block max-w-44 truncate text-[12px] text-muted">
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
                  <span className="block max-w-52 truncate text-[12px] text-muted">
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
                <td className="tabular px-3 py-2.5 text-right text-muted">
                  {o.price ? inr(o.price) : "—"}
                </td>
                <td className="tabular px-3 py-2.5 text-right font-semibold">
                  {o.value ? inrCompact(o.value) : "—"}
                </td>
                <td className="tabular hidden px-3 py-2.5 text-right text-muted lg:table-cell">
                  {o.stage === "closed_won" && o.totalCost
                    ? inrCompact(o.totalCost)
                    : "—"}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 lg:table-cell">{o.ownerName}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">
                  {formatDate(o.expectedCloseDate)}
                </td>
                <td className="tabular hidden px-3 py-2.5 text-right text-muted lg:table-cell">
                  {formatDate(o.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line bg-canvas/60 font-semibold">
            <td className="sticky left-0 z-10 bg-canvas/60 px-3 py-2.5">
              {rows.length} deals
            </td>
            <td colSpan={3} />
            <td className="tabular px-3 py-2.5 text-right">{num(totals.fleet)}</td>
            <td />
            <td className="tabular px-3 py-2.5 text-right">
              {inrCompact(totals.value)}
            </td>
            <td className="hidden lg:table-cell" colSpan={2} />
            <td />
            <td className="hidden lg:table-cell" />
          </tr>
        </tfoot>
      </table>
      </div>
    </>
  );
}
