"use client";

import { Check, ListFilter, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Badge, Button, Sheet } from "@/components/ui";
import { cn, formatDate, monthLabelLong, num } from "@/lib/utils";
import { recordDeployment } from "@/server/actions";
import type { Deployment } from "@/server/queries";

/**
 * What ops has to put on the road.
 *
 * Every row answers the four questions in one line — which customer, which
 * city, how many of what, by when — and carries how many are already out,
 * because a fleet rarely goes in one trip.
 *
 * Outstanding work is at the top and overdue is red. Completed deployments
 * drop to the bottom rather than disappearing, so "did we do that one" has an
 * answer.
 */

type Group = { key: string; label: string; rows: Deployment[] };

export function DeploymentsBoard({
  deployments,
  cities,
  vehicleTypes,
  /** Ops must not reach a deal page; it carries the margin. */
  canOpenDeals,
}: {
  deployments: Deployment[];
  cities: { id: string; name: string }[];
  vehicleTypes: { id: string; name: string }[];
  canOpenDeals: boolean;
}) {
  const router = useRouter();
  const [cityIds, setCityIds] = React.useState<string[]>([]);
  const [vehicleIds, setVehicleIds] = React.useState<string[]>([]);
  const [filtering, setFiltering] = React.useState(false);
  const [target, setTarget] = React.useState<Deployment | null>(null);

  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const filtered = React.useMemo(() => {
    const has = (group: string[], v: string | null) =>
      group.length === 0 || (v !== null && group.includes(v));
    return deployments.filter(
      (d) => has(cityIds, d.cityId) && has(vehicleIds, d.vehicleTypeId),
    );
  }, [deployments, cityIds, vehicleIds]);

  const outstanding = filtered.filter((d) => d.vehiclesDeployed < d.fleetSize);
  const done = filtered.filter((d) => d.vehiclesDeployed >= d.fleetSize);

  const remaining = (d: Deployment) => d.fleetSize - d.vehiclesDeployed;
  const isOverdue = (d: Deployment) => Boolean(d.deploymentDate && d.deploymentDate < today);
  const thisMonth = today.slice(0, 7);

  const totals = {
    vehicles: outstanding.reduce((s, d) => s + remaining(d), 0),
    thisMonth: outstanding
      .filter((d) => d.deploymentDate?.slice(0, 7) === thisMonth)
      .reduce((s, d) => s + remaining(d), 0),
    overdue: outstanding.filter(isOverdue).reduce((s, d) => s + remaining(d), 0),
  };

  // Grouped by the month they are due, which is how ops plans a week.
  const groups = React.useMemo<Group[]>(() => {
    const map = new Map<string, Deployment[]>();
    for (const d of outstanding) {
      const key = d.deploymentDate?.slice(0, 7) ?? "undated";
      (map.get(key) ?? map.set(key, []).get(key)!).push(d);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] === "undated" ? 1 : b[0] === "undated" ? -1 : a[0] < b[0] ? -1 : 1))
      .map(([key, rows]) => ({
        key,
        label: key === "undated" ? "No date set" : monthLabelLong(key),
        rows,
      }));
  }, [outstanding]);

  const filterCount = cityIds.length + vehicleIds.length;

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Tile label="Vehicles to deploy" value={num(totals.vehicles)} />
        <Tile label="Due this month" value={num(totals.thisMonth)} />
        <Tile
          label="Overdue"
          value={num(totals.overdue)}
          tone={totals.overdue ? "bad" : undefined}
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setFiltering(true)}
          className={cn(
            "flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium",
            filterCount
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-line bg-white text-muted",
          )}
        >
          <ListFilter size={16} />
          Filter
          {filterCount ? (
            <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
              {filterCount}
            </span>
          ) : null}
        </button>
        <p className="text-[13px] text-muted">
          {outstanding.length} outstanding · {done.length} done
        </p>
      </div>

      {outstanding.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
          <p className="font-semibold">Nothing waiting to be deployed</p>
          <p className="mt-1 text-sm text-muted">
            {deployments.length
              ? "Every won deal has its vehicles on the road."
              : "Deals appear here once they are marked Closed Won."}
          </p>
        </div>
      ) : null}

      {groups.map((g) => (
        <section key={g.key} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
              {g.label}
            </h2>
            <span className="tabular text-[13px] font-semibold">
              {num(g.rows.reduce((s, d) => s + remaining(d), 0))} vehicles
            </span>
          </div>
          <ul className="space-y-2">
            {g.rows.map((d) => (
              <Row
                key={d.id}
                d={d}
                overdue={isOverdue(d)}
                canOpenDeals={canOpenDeals}
                onRecord={() => setTarget(d)}
              />
            ))}
          </ul>
        </section>
      ))}

      {done.length ? (
        <section className="mb-5">
          <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
            Deployed
          </h2>
          <ul className="space-y-2">
            {done.map((d) => (
              <Row
                key={d.id}
                d={d}
                overdue={false}
                canOpenDeals={canOpenDeals}
                onRecord={() => setTarget(d)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <RecordSheet
        target={target}
        onClose={() => setTarget(null)}
        onSaved={() => {
          setTarget(null);
          router.refresh();
        }}
      />

      <Sheet
        open={filtering}
        onClose={() => setFiltering(false)}
        title="Filter deployments"
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!filterCount}
              onClick={() => {
                setCityIds([]);
                setVehicleIds([]);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="brand"
              className="flex-1"
              onClick={() => setFiltering(false)}
            >
              Show {outstanding.length + done.length}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <ChipGroup
            label="City"
            options={cities}
            selected={cityIds}
            onToggle={(id) =>
              setCityIds((v) =>
                v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
              )
            }
          />
          <ChipGroup
            label="Vehicle type"
            options={vehicleTypes}
            selected={vehicleIds}
            onToggle={(id) =>
              setVehicleIds((v) =>
                v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
              )
            }
          />
        </div>
      </Sheet>
    </div>
  );
}

function Row({
  d,
  overdue,
  canOpenDeals,
  onRecord,
}: {
  d: Deployment;
  overdue: boolean;
  canOpenDeals: boolean;
  onRecord: () => void;
}) {
  const remaining = d.fleetSize - d.vehiclesDeployed;
  const complete = remaining <= 0;
  const started = d.vehiclesDeployed > 0 && !complete;

  const head = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5 text-[16px] font-semibold leading-tight">
            <span className="truncate">{d.accountName}</span>
            {d.isRepeat ? (
              <span className="shrink-0 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">
                Repeat
              </span>
            ) : null}
          </p>
          <p className="mt-1 truncate text-[13px] text-muted">
            {d.city ?? "No city"} · {d.ownerName.split(" ")[0]}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "tabular text-[13px] font-semibold",
              overdue ? "text-rose-700" : "text-muted",
            )}
          >
            {d.deploymentDate ? formatDate(d.deploymentDate) : "No date"}
          </p>
          {overdue ? (
            <p className="text-[11px] font-semibold text-rose-700">Overdue</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-2 py-1 font-medium">
          <Truck size={14} className="text-muted" />
          {d.fleetSize} × {d.vehicleType ?? "—"}
        </span>
        {complete ? (
          <Badge className="bg-emerald-100 text-emerald-800">
            <Check size={12} className="mr-1 inline align-[-1px]" />
            All {d.fleetSize} deployed
          </Badge>
        ) : (
          <span
            className={cn(
              "tabular rounded-lg px-2 py-1 font-semibold",
              started ? "bg-amber-50 text-amber-900" : "text-muted",
            )}
          >
            {started
              ? `${d.vehiclesDeployed} of ${d.fleetSize} out · ${remaining} to go`
              : `${remaining} to deploy`}
          </span>
        )}
      </div>
    </>
  );

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-white">
      {canOpenDeals ? (
        <Link href={`/opportunities/${d.id}`} className="block px-4 pt-3.5">
          {head}
        </Link>
      ) : (
        <div className="px-4 pt-3.5">{head}</div>
      )}
      <button
        onClick={onRecord}
        className="mt-3 w-full border-t border-line py-3 text-[13px] font-semibold text-brand-ink transition active:bg-canvas"
      >
        {complete ? "Change deployed count" : "Record deployment"}
      </button>
    </li>
  );
}

/** How many went out. A number, because "done" is often only partly true. */
function RecordSheet({
  target,
  onClose,
  onSaved,
}: {
  target: Deployment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [count, setCount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!target) return;
    setCount(String(target.vehiclesDeployed));
    setError(null);
  }, [target]);

  if (!target) return null;
  const n = Number(count || 0);

  function save() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await recordDeployment(target.id, n);
      if (!result.ok) return setError(result.error);
      onSaved();
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Record deployment"
      footer={
        <Button
          type="button"
          variant="brand"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      }
    >
      <p className="-mt-1 mb-4 text-sm text-muted">
        <strong>{target.accountName}</strong> · {target.city ?? "No city"} ·{" "}
        {target.fleetSize} × {target.vehicleType ?? "—"}
      </p>

      <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
        How many vehicles are on the road?
      </p>
      <div className="flex h-12 items-center rounded-xl border border-line bg-white">
        <button
          type="button"
          onClick={() => setCount(String(Math.max(0, n - 1)))}
          className="h-full w-12 rounded-l-xl text-xl text-muted active:bg-canvas"
          aria-label="One fewer"
        >
          −
        </button>
        <input
          inputMode="numeric"
          aria-label="Vehicles deployed"
          value={count}
          onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
          className="tabular w-full border-0 bg-transparent text-center text-lg font-semibold focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setCount(String(Math.min(target.fleetSize, n + 1)))}
          className="h-full w-12 rounded-r-xl text-xl text-muted active:bg-canvas"
          aria-label="One more"
        >
          +
        </button>
      </div>
      <p className="mt-1.5 text-[12px] text-muted">
        of {target.fleetSize} in this deal. Partial deployments are fine — put
        in what is actually out.
      </p>

      <button
        type="button"
        onClick={() => setCount(String(target.fleetSize))}
        className="mt-3 h-11 w-full rounded-xl border border-line text-sm font-semibold text-brand-ink active:bg-canvas"
      >
        All {target.fleetSize} are out
      </button>

      {error ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-white px-3 py-2.5",
        tone === "bad" && "border-rose-200 bg-rose-50",
      )}
    >
      <p
        className={cn(
          "tabular text-[20px] font-bold leading-none",
          tone === "bad" && "text-rose-700",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-tight text-muted">{label}</p>
    </div>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <p className="text-[13px] font-semibold">{label}</p>
        <p className="text-[12px] text-muted">
          {selected.length ? `${selected.length} selected` : "All"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.id)}
              aria-pressed={on}
              className={cn(
                "h-10 rounded-full border px-3.5 text-[13px] font-semibold transition",
                on
                  ? "border-brand bg-brand-soft text-brand-ink"
                  : "border-line bg-white text-muted",
              )}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
