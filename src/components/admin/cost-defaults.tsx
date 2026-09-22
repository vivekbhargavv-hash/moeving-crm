"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Card, CardHeader } from "@/components/ui";
import {
  CHARGING_SCOPE_LABEL,
  COST_FIELDS,
  OPERATING_DAYS,
  type CostDimension,
} from "@/lib/constants";
import type { CostDefault } from "@/lib/cost-defaults";
import { cn } from "@/lib/utils";
import { saveCostDefault } from "@/server/actions";

type VehicleType = { id: string; name: string };

/** One cell of the grid: the combination it stands for, and its amount. */
type Cell = {
  vehicleTypeId: string | null;
  chargingScope: "client" | "moeving" | null;
  operatingDays: number | null;
  label: string;
  amount: number | null;
};

/**
 * The standard rate for every cost line, as a grid per line.
 *
 * The grid is generated from each line's declared dimensions, so it is never
 * out of step with the lookup that reads it: add a vehicle type in Master data
 * and its Lease and Charging cells appear here, empty, waiting for a number.
 *
 * Blank is not zero. A blank cell means nobody has said, and the cost sheet
 * leaves that line alone; a zero means the business has said this is free,
 * which is the honest answer for charging a client pays for.
 */
export function CostDefaultsEditor({
  vehicleTypes,
  rows,
}: {
  vehicleTypes: VehicleType[];
  rows: CostDefault[];
}) {
  return (
    <div className="space-y-4">
      {COST_FIELDS.map((field) => (
        <CostLine
          key={field.key}
          costKey={field.key}
          label={field.label}
          dimensions={field.dimensions}
          vehicleTypes={vehicleTypes}
          rows={rows.filter((r) => r.costKey === field.key)}
        />
      ))}
    </div>
  );
}

function CostLine({
  costKey,
  label,
  dimensions,
  vehicleTypes,
  rows,
}: {
  costKey: string;
  label: string;
  dimensions: readonly CostDimension[];
  vehicleTypes: VehicleType[];
  rows: CostDefault[];
}) {
  const cells = buildCells(dimensions, vehicleTypes, rows);

  return (
    <Card>
      <CardHeader title={`${label} — per vehicle / month`} />
      <p className="px-4 pb-3 text-[13px] text-muted">{describe(dimensions)}</p>
      <div className="divide-y divide-line border-t border-line">
        {cells.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-muted">
            Add a vehicle type in Master data and it will appear here.
          </p>
        ) : (
          cells.map((cell) => (
            <AmountRow
              key={`${cell.vehicleTypeId}-${cell.chargingScope}-${cell.operatingDays}`}
              costKey={costKey}
              cell={cell}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function AmountRow({ costKey, cell }: { costKey: string; cell: Cell }) {
  const router = useRouter();
  const [value, setValue] = React.useState(
    cell.amount === null ? "" : String(cell.amount),
  );
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = React.useState<string | null>(null);

  // What is stored, so an unchanged blur is not a pointless round trip.
  const savedRef = React.useRef(cell.amount === null ? "" : String(cell.amount));
  React.useEffect(() => {
    const next = cell.amount === null ? "" : String(cell.amount);
    savedRef.current = next;
    setValue(next);
  }, [cell.amount]);

  function commit() {
    if (value === savedRef.current) return;
    setError(null);
    setState("saving");
    const amount = value === "" ? null : Number(value);
    saveCostDefault({
      costKey,
      vehicleTypeId: cell.vehicleTypeId,
      chargingScope: cell.chargingScope,
      operatingDays: cell.operatingDays,
      amount,
    })
      .then((result) => {
        if (!result.ok) {
          setState("idle");
          setError(result.error);
          return;
        }
        savedRef.current = value;
        setState("saved");
        router.refresh();
        setTimeout(() => setState("idle"), 1600);
      })
      .catch(() => {
        setState("idle");
        setError("Could not save that. Check your connection.");
      });
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {cell.label}
      </span>
      {error ? (
        <span className="shrink-0 text-[12px] text-rose-700">{error}</span>
      ) : null}
      <span className="shrink-0 text-sm text-muted">₹</span>
      <input
        inputMode="numeric"
        value={value}
        placeholder="—"
        aria-label={`${cell.label} amount`}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn(
          "tabular h-10 w-28 shrink-0 rounded-xl border bg-white px-3 text-right text-sm font-semibold focus:border-brand focus:outline-none",
          state === "saved" ? "border-emerald-500" : "border-line",
        )}
      />
      <span className="flex w-5 shrink-0 justify-center">
        {state === "saving" ? (
          <Loader2 size={15} className="animate-spin text-muted" />
        ) : state === "saved" ? (
          <Check size={15} className="text-emerald-600" />
        ) : null}
      </span>
    </div>
  );
}

/**
 * Every combination a cost line needs an answer for, in the order a person
 * would read them, each carrying whatever is stored for it.
 */
function buildCells(
  dimensions: readonly CostDimension[],
  vehicleTypes: VehicleType[],
  rows: CostDefault[],
): Cell[] {
  const vehicles = dimensions.includes("vehicleType")
    ? vehicleTypes.map((v) => ({ id: v.id, name: v.name }))
    : [{ id: null, name: null }];
  const scopes = dimensions.includes("chargingScope")
    ? (["moeving", "client"] as const)
    : ([null] as const);
  const days = dimensions.includes("operatingDays")
    ? OPERATING_DAYS.map((d) => d.value)
    : [null];

  const cells: Cell[] = [];
  for (const vehicle of vehicles) {
    for (const scope of scopes) {
      for (const day of days) {
        const stored = rows.find(
          (r) =>
            r.vehicleTypeId === vehicle.id &&
            r.chargingScope === scope &&
            r.operatingDays === day,
        );
        cells.push({
          vehicleTypeId: vehicle.id,
          chargingScope: scope,
          operatingDays: day,
          label:
            [
              vehicle.name,
              scope ? `${CHARGING_SCOPE_LABEL[scope]} pays` : null,
              day ? `${day} days` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Every deal",
          amount: stored?.amount ?? null,
        });
      }
    }
  }
  return cells;
}

function describe(dimensions: readonly CostDimension[]) {
  if (dimensions.length === 0) {
    return "The same on every deal.";
  }
  const names = dimensions.map((d) =>
    d === "vehicleType"
      ? "the vehicle type"
      : d === "chargingScope"
        ? "who pays for charging"
        : "the operating days",
  );
  return `Varies by ${names.join(" and ")}. Leave a cell blank and the cost sheet will not fill that line in; enter 0 to say it is genuinely free.`;
}
