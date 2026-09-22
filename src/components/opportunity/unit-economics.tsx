"use client";

import { Calculator, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button, Field, Input, Sheet } from "@/components/ui";
import { Card, CardHeader } from "@/components/ui-server";
import { COST_FIELDS } from "@/lib/constants";
import { cn, inr } from "@/lib/utils";
import { saveUnitEconomics } from "@/server/actions";
import type { EconomicsSheet } from "@/server/actions";

/**
 * The cost sheet, editable at any stage.
 *
 * Unit economics used to appear only once a deal was won, which put the whole
 * sheet on the one screen where somebody is busiest and least able to go and
 * ask. Pricing is worked out while quoting, so it is captured while quoting —
 * and Closed Won simply refuses to happen until every figure is there.
 *
 * Revenue is not one of the questions. What a vehicle earns in a month is the
 * price it was quoted at, which the deal already holds; asking again made two
 * fields for one number, and two numbers that could disagree. It is shown
 * here, sourced from the price, and changed by changing the price.
 */
export function UnitEconomics({
  id,
  fleetSize,
  price,
  isWon,
  sheet,
}: {
  id: string;
  fleetSize: number;
  /** The quoted rent per vehicle — what revenue starts from. */
  price: number | null;
  isWon: boolean;
  sheet: EconomicsSheet;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [values, setValues] = React.useState<Record<string, string>>({});

  // Each opening starts from what is stored, so an abandoned edit leaves
  // nothing behind.
  React.useEffect(() => {
    if (!editing) return;
    setError(null);
    setValues(
      Object.fromEntries(
        Object.entries(sheet).map(([k, v]) => [k, v === null ? "" : String(v)]),
      ),
    );
  }, [editing, sheet]);

  // Revenue is the deal's price rather than an answer given here, so what is
  // "filled in" is the costs plus that price — counted the same way the
  // Closed Won check counts it, since that is what the deal will be held to.
  const filled = Object.values({ ...sheet, revenue: price }).filter(
    (v) => v !== null && v !== undefined,
  ).length;
  const missing = Object.values(sheet).length - filled;

  const draftRevenue = price ?? 0;
  const draftCost = COST_FIELDS.reduce(
    (sum, f) => sum + (Number(values[f.key] || 0) || 0),
    0,
  );
  const draftMargin = draftRevenue - draftCost;
  const draftMarginPct = draftRevenue ? (draftMargin / draftRevenue) * 100 : null;

  function set(key: string, raw: string) {
    setValues((v) => ({ ...v, [key]: raw.replace(/\D/g, "") }));
  }

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveUnitEconomics(id, formData);
        if (!result.ok) return setError(result.error);
        setEditing(false);
        router.refresh();
      } catch {
        setError("Could not save that. Check your connection and try again.");
      }
    });
  }

  const costPerVehicle = COST_FIELDS.reduce(
    (sum, f) => sum + (sheet[f.key] ?? 0),
    0,
  );
  // The deal's price is the truth; a stored revenue that predates that rule
  // only shows through on a deal with no price at all.
  const revenue = price ?? sheet.revenue;
  const marginPerVehicle = (revenue ?? 0) - costPerVehicle;
  const marginPct = revenue ? (marginPerVehicle / revenue) * 100 : null;

  return (
    <>
      <Card>
        <CardHeader
          title="Unit economics — per vehicle / month"
          action={
            <button
              onClick={() => setEditing(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-brand-ink hover:bg-canvas"
            >
              <Pencil size={14} /> {filled === 0 ? "Add" : "Edit"}
            </button>
          }
        />

        {filled === 0 ? (
          <div className="px-4 pb-4">
            <div className="flex items-start gap-3 rounded-xl bg-canvas px-4 py-3 text-sm">
              <Calculator size={18} className="mt-0.5 shrink-0 text-muted" />
              <p className="text-muted">
                Not costed yet. Fill this in whenever the numbers are known —
                it is asked for again, and required, when the deal moves to
                Closed Won.
              </p>
            </div>
          </div>
        ) : (
          <dl className="px-4 pb-4 text-sm">
            <Row label="Revenue" value={inr(revenue)} />
            {COST_FIELDS.map((f) => (
              <Row key={f.key} label={f.label} value={inr(sheet[f.key])} muted />
            ))}
            <Row label="Cost per vehicle" value={inr(costPerVehicle)} />
            <Row
              label="Margin per vehicle"
              value={inr(marginPerVehicle)}
              strong
            />
            <Row
              label="Margin %"
              value={marginPct === null ? "—" : `${marginPct.toFixed(1)}%`}
              strong
              tone={
                marginPct === null
                  ? undefined
                  : marginPct < 0
                    ? "text-rose-700"
                    : "text-emerald-700"
              }
            />
            {missing > 0 ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                {missing} {missing === 1 ? "figure is" : "figures are"} still
                blank, and every one is needed before this deal can be closed as
                Won. The margin above treats a blank as zero.
              </p>
            ) : null}
          </dl>
        )}
      </Card>

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="Unit economics"
        action={save}
        footer={
          <Button
            variant="brand"
            size="lg"
            className="w-full"
            disabled={pending || price === null}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-brand-soft/60 px-4 py-3 text-sm text-muted">
            Per vehicle, per month. Quoted at{" "}
            <span className="font-medium text-brand-ink">
              {price ? inr(price) : "—"}
            </span>{" "}
            per vehicle · {fleetSize} {fleetSize === 1 ? "vehicle" : "vehicles"}{" "}
            in this deal.
          </p>

          <div className="flex items-baseline justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-[13px] font-medium">Revenue per vehicle / month</p>
              <p className="text-[12px] text-muted">
                The price this deal is quoted at. Change it by editing the deal.
              </p>
            </div>
            <span className="tabular shrink-0 font-semibold">
              {price ? inr(price) : "—"}
            </span>
          </div>

          {price === null ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              This deal has no price yet, so there is nothing for it to earn.
              Set the price per vehicle in <strong>Edit</strong> first — the
              costs below can be saved once it has one.
            </p>
          ) : null}

          <p className="!mt-5 text-[13px] font-medium text-muted">
            Monthly cost of running one vehicle
          </p>

          <div className="grid grid-cols-2 gap-3">
            {COST_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input
                  name={f.key}
                  inputMode="numeric"
                  required={isWon}
                  placeholder="₹0"
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </Field>
            ))}
          </div>

          <dl className="rounded-xl bg-canvas p-4 text-sm">
            <Row label="Cost per vehicle" value={inr(draftCost)} />
            <Row label="Margin per vehicle" value={inr(draftMargin)} strong />
            <Row
              label="Margin %"
              value={
                draftMarginPct === null ? "—" : `${draftMarginPct.toFixed(1)}%`
              }
              tone={
                draftMarginPct === null
                  ? undefined
                  : draftMarginPct >= 0
                    ? "text-emerald-700"
                    : "text-rose-700"
              }
            />
            <div className="my-2 border-t border-line" />
            <p className="pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">
              Whole deal × {fleetSize}
            </p>
            <Row label="Revenue / month" value={inr(draftRevenue * fleetSize)} />
            <Row label="Cost / month" value={inr(draftCost * fleetSize)} />
            <Row
              label="Gross margin / month"
              value={inr(draftMargin * fleetSize)}
              strong
            />
          </dl>

          {isWon ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              This is a recorded win, so the sheet has to stay complete — these
              figures are the margin already reported for the month it closed
              in. Correct them freely; they cannot be left blank.
            </p>
          ) : (
            <p className="text-[13px] text-muted">
              Partial is fine at this stage. Anything still blank is asked for
              when the deal moves to Closed Won.
            </p>
          )}

          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0",
        muted && "text-muted",
      )}
    >
      <dt className={cn(!muted && "text-muted")}>{label}</dt>
      <dd
        className={cn(
          "tabular truncate text-right",
          strong ? "font-semibold" : "font-medium",
          tone,
        )}
      >
        {value}
      </dd>
    </div>
  );
}
