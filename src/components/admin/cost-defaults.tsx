"use client";

import { Check, Loader2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button, Card, CardHeader } from "@/components/ui";
import {
  CHARGING_SCOPE_LABEL,
  COST_FIELDS,
  OPERATING_DAYS,
  type CostDimension,
} from "@/lib/constants";
import type { CostDefault } from "@/lib/cost-defaults";
import { cn, num } from "@/lib/utils";
import { applyCostDefaults, saveCostDefault } from "@/server/actions";

type VehicleType = { id: string; name: string };

/** One cell of the grid: the combination it stands for, and its amount. */
type Cell = {
  /** Identifies the cell in the draft, and as a React key. */
  id: string;
  costKey: string;
  vehicleTypeId: string | null;
  chargingScope: "client" | "moeving" | null;
  operatingDays: number | null;
  label: string;
  /** What is stored today, as typed into the box: "" for a blank. */
  stored: string;
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
 *
 * Every box on this screen is one draft, saved by one button. It used to save
 * each cell silently on blur, which is a fine mechanism and a bad promise:
 * somebody filling in twelve rates has no way to tell a saved screen from an
 * unsaved one, and the last box — the one still focused when they walk away —
 * is exactly the one that never fired.
 */
export function CostDefaultsEditor({
  vehicleTypes,
  rows,
}: {
  vehicleTypes: VehicleType[];
  rows: CostDefault[];
}) {
  const router = useRouter();

  const cells = React.useMemo(
    () =>
      COST_FIELDS.flatMap((field) =>
        buildCells(
          field.key,
          field.dimensions,
          vehicleTypes,
          rows.filter((r) => r.costKey === field.key),
        ),
      ),
    [vehicleTypes, rows],
  );

  /** Only the boxes somebody has touched; everything else reads from `cells`. */
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = React.useState<string | null>(null);

  // A refresh brings back what was just written. Anything still different
  // from it is a genuine unsaved edit, so the draft is pruned rather than
  // cleared: a rate typed while the save was in flight is not thrown away.
  React.useEffect(() => {
    setDraft((d) => {
      const next: Record<string, string> = {};
      for (const cell of cells) {
        const typed = d[cell.id];
        if (typed !== undefined && typed !== cell.stored) next[cell.id] = typed;
      }
      return next;
    });
  }, [cells]);

  const valueOf = (cell: Cell) => draft[cell.id] ?? cell.stored;
  const changed = cells.filter((c) => valueOf(c) !== c.stored);

  function set(id: string, raw: string) {
    setState("idle");
    setError(null);
    setDraft((d) => ({ ...d, [id]: raw.replace(/\D/g, "") }));
  }

  function save() {
    if (!changed.length) return;
    setError(null);
    setState("saving");
    // One at a time, in the order they are read down the screen, so a failure
    // names the rate it failed on rather than "something did not save".
    (async () => {
      for (const cell of changed) {
        const raw = valueOf(cell);
        const result = await saveCostDefault({
          costKey: cell.costKey,
          vehicleTypeId: cell.vehicleTypeId,
          chargingScope: cell.chargingScope,
          operatingDays: cell.operatingDays,
          amount: raw === "" ? null : Number(raw),
        });
        if (!result.ok) throw new Error(`${cell.label}: ${result.error}`);
      }
    })()
      .then(() => {
        setState("saved");
        router.refresh();
        setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 2400);
      })
      .catch((e: unknown) => {
        setState("idle");
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Could not save that. Check your connection.",
        );
      });
  }

  return (
    <div className="space-y-4 pb-24">
      {COST_FIELDS.map((field) => (
        <CostLine
          key={field.key}
          label={field.label}
          dimensions={field.dimensions}
          cells={cells.filter((c) => c.costKey === field.key)}
          valueOf={valueOf}
          onChange={set}
        />
      ))}

      <ApplyToDeals disabled={changed.length > 0} />

      {/* The save bar sits above the tab bar on a phone and at the foot of
          the page on desktop, so the button is never a scroll away from the
          box that was just typed into. */}
      <div className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-20 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-[0_-2px_12px_rgba(16,24,40,0.06)] backdrop-blur md:bottom-4">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-[13px] text-muted">
            {error ? (
              <span role="alert" className="font-medium text-rose-700">{error}</span>
            ) : state === "saved" ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                <Check size={15} /> Standard rates saved
              </span>
            ) : changed.length ? (
              `${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}`
            ) : (
              "Blank means nobody has said; 0 means genuinely free."
            )}
          </p>
          <Button
            variant="brand"
            size="lg"
            className="shrink-0"
            disabled={!changed.length || state === "saving"}
            onClick={save}
          >
            {state === "saving" ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Carrying the rates onto the deals that are already in the pipeline.
 *
 * A standard rate on its own changes nothing about a deal — it pre-fills the
 * cost sheet the next time somebody opens one. Every deal raised before the
 * rates existed therefore shows no cost and no margin in the Pipeline until a
 * person opens it, which on a real pipeline is nobody's afternoon.
 *
 * This fills the blanks and only the blanks, so a costed deal keeps its
 * figures and a won deal — which cannot have a blank — is left alone entirely.
 */
function ApplyToDeals({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function apply() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await applyCostDefaults();
      if (!outcome.ok) return setError(outcome.error);
      const { deals, figures } = outcome.data!;
      setResult(
        deals === 0
          ? "Every deal already carries its figures — nothing was blank."
          : `Filled ${num(figures)} blank ${figures === 1 ? "figure" : "figures"} across ${num(deals)} ${deals === 1 ? "deal" : "deals"}.`,
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader title="Apply these rates to deals already in the pipeline" />
      <div className="px-4 pb-4">
        <p className="text-[13px] text-muted">
          Fills in cost lines that are still blank, on deals nobody has costed
          yet. Figures somebody has already typed are never changed, and a
          recorded win — whose margin has been reported — cannot have a blank,
          so none are touched.
        </p>
        <Button
          variant="secondary"
          size="lg"
          className="mt-3 w-full sm:w-auto"
          disabled={pending || disabled}
          onClick={apply}
        >
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Applying…
            </>
          ) : (
            <>
              <Wand2 size={16} /> Fill in the blanks
            </>
          )}
        </Button>
        {disabled ? (
          <p className="mt-2 text-[12.5px] text-muted">
            Save your changes above first, so the deals get the rates you meant.
          </p>
        ) : null}
        {result ? (
          <p className="mt-2 text-[12.5px] font-medium text-emerald-700">{result}</p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-[12.5px] font-medium text-rose-700">{error}</p>
        ) : null}
      </div>
    </Card>
  );
}

function CostLine({
  label,
  dimensions,
  cells,
  valueOf,
  onChange,
}: {
  label: string;
  dimensions: readonly CostDimension[];
  cells: Cell[];
  valueOf: (cell: Cell) => string;
  onChange: (id: string, raw: string) => void;
}) {
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
          cells.map((cell) => {
            const value = valueOf(cell);
            const dirty = value !== cell.stored;
            return (
              <div key={cell.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {cell.label}
                </span>
                <span className="shrink-0 text-sm text-muted">₹</span>
                <input
                  inputMode="numeric"
                  value={value}
                  placeholder="—"
                  aria-label={`${cell.label} amount`}
                  onChange={(e) => onChange(cell.id, e.target.value)}
                  className={cn(
                    "tabular h-11 w-28 shrink-0 rounded-xl border bg-white px-3 text-right text-sm font-semibold focus:border-brand focus:outline-none",
                    dirty ? "border-brand ring-2 ring-brand/20" : "border-line",
                  )}
                />
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

/**
 * Every combination a cost line needs an answer for, in the order a person
 * would read them, each carrying whatever is stored for it.
 */
function buildCells(
  costKey: string,
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
          id: `${costKey}|${vehicle.id}|${scope}|${day}`,
          costKey,
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
          stored: stored?.amount === undefined ? "" : String(stored.amount),
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
