"use client";

import { CopyPlus, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button, Field, Input, Sheet } from "@/components/ui";
import { cn, inr, monthLabelShort, upcomingMonths } from "@/lib/utils";
import { createExpansion } from "@/server/actions";

/**
 * Repeat business: an existing customer taking more vehicles.
 *
 * Only three things are genuinely new — where they go, how many, and when.
 * The commercials came with the contract, so they are shown as a locked panel
 * rather than fields: seeing what you are committing to matters, editing it
 * here does not. The server copies them off the parent row regardless of what
 * this form posts, so the lock is real and not just disabled inputs.
 */

export type ExpansionSource = {
  id: string;
  accountName: string;
  cityId: string | null;
  cityName: string | null;
  vehicleType: string | null;
  driverTypeLabel: string | null;
  chargingScopeLabel: string | null;
  /** Per vehicle per month, from the won deal's cost sheet. */
  revenue: number | null;
  costPerVehicle: number | null;
  marginPerVehicle: number | null;
  marginPct: number | null;
};

export function ExpandDeal({
  source,
  cities,
}: {
  source: ExpansionSource;
  cities: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [cityId, setCityId] = React.useState(source.cityId ?? "");
  const [fleet, setFleet] = React.useState("");
  const [month, setMonth] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const months = React.useMemo(() => upcomingMonths(6), []);
  const fleetCount = Number(fleet || 0);

  React.useEffect(() => {
    if (!open) return;
    setCityId(source.cityId ?? "");
    setFleet("");
    setMonth("");
    setError(null);
  }, [open, source.cityId]);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createExpansion(source.id, formData);
        if (!result.ok) return setError(result.error);
        setOpen(false);
        router.refresh();
        router.push(`/opportunities/${result.data!.id}`);
      } catch {
        setError("Could not save that. Check your connection and try again.");
      }
    });
  }

  const movedCity = cityId !== (source.cityId ?? "");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-brand bg-brand-soft text-[15px] font-semibold text-brand-ink active:scale-[0.99]"
      >
        <CopyPlus size={18} />
        Deploy more vehicles
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Deploy more vehicles"
        action={submit}
        footer={
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm">
              <span className="text-muted">Added margin </span>
              <span className="tabular font-semibold">
                {fleetCount && source.marginPerVehicle !== null
                  ? `${inr(source.marginPerVehicle * fleetCount)} / mo`
                  : "—"}
              </span>
            </div>
            <Button variant="brand" size="lg" disabled={pending}>
              {pending ? "Saving…" : "Add vehicles"}
            </Button>
          </div>
        }
      >
        <p className="-mt-1 mb-4 text-sm text-muted">
          More vehicles for <strong>{source.accountName}</strong> on the terms
          already agreed.
        </p>

        <div className="space-y-4">
          <Field label="City" hint="Where the additional vehicles are deployed.">
            <div className="flex flex-wrap gap-2">
              {cities.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={cityId === c.id}
                  onClick={() => setCityId(c.id)}
                  className={cn(
                    "h-11 rounded-xl border px-3.5 text-sm font-medium transition",
                    cityId === c.id
                      ? "border-brand bg-brand-soft text-brand-ink"
                      : "border-line bg-white text-muted",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <input type="hidden" name="cityId" value={cityId} />
          </Field>

          {movedCity ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              A different city to the original deal. The costs below still come
              from that contract — if driver or parking rates differ here, the
              margin shown will be optimistic.
            </p>
          ) : null}

          <Field label="How many more vehicles?">
            <Input
              name="fleetSize"
              inputMode="numeric"
              required
              autoFocus
              placeholder="e.g. 10"
              value={fleet}
              onChange={(e) => setFleet(e.target.value.replace(/\D/g, ""))}
            />
          </Field>

          <div>
            <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
              Expected deployment month
            </p>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {months.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={month === m}
                  onClick={() => setMonth(m)}
                  className={cn(
                    "h-11 shrink-0 rounded-xl border px-4 text-sm font-medium transition",
                    month === m
                      ? "border-brand bg-brand-soft text-brand-ink"
                      : "border-line bg-white text-muted",
                  )}
                >
                  {monthLabelShort(m)}
                </button>
              ))}
            </div>
            <input type="hidden" name="deploymentMonth" value={month} />
            <p className="mt-1.5 text-[12px] text-muted">
              This is the month the added revenue counts in.
            </p>
          </div>

          {/* Locked: it came with the contract, so it is shown, not asked. */}
          <div className="rounded-xl border border-line bg-canvas/60 p-4">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold">
              <Lock size={13} className="text-muted" />
              Locked from the won deal
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              Per vehicle per month. To change any of this, it is a new deal,
              not more vehicles on this one.
            </p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Locked label="Vehicle" value={source.vehicleType ?? "—"} />
              <Locked label="Driver type" value={source.driverTypeLabel ?? "—"} />
              <Locked label="Charging" value={source.chargingScopeLabel ?? "—"} />
              <Locked label="Revenue" value={inr(source.revenue)} />
              <Locked label="Cost" value={inr(source.costPerVehicle)} />
              <Locked
                label="Margin"
                value={`${inr(source.marginPerVehicle)}${
                  source.marginPct === null
                    ? ""
                    : ` · ${source.marginPct.toFixed(1)}%`
                }`}
                strong
              />
            </dl>
          </div>

          <p className="text-xs text-muted">
            Saved as <span className="font-medium">Closed Won</span> — these
            vehicles are not being sold, they are being added. The original deal
            is not changed.
          </p>

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

function Locked({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular text-right", strong && "font-semibold")}>
        {value}
      </dd>
    </div>
  );
}
