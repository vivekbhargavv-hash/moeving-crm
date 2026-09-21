"use client";

import { Check, ChevronRight, ListFilter, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Badge, Button, Segmented, Sheet } from "@/components/ui";
import { groupByCity, groupByDueDate } from "@/lib/deployment-groups";
import type { Group } from "@/lib/deployment-groups";
import { cn, daysUntil, formatDateCompact, num } from "@/lib/utils";
import { recordDeployment } from "@/server/actions";
import type { Deployment } from "@/server/queries";

/**
 * What ops has to put on the road.
 *
 * Every row answers the five questions in one line — which customer, which
 * vehicle, how many, which city, by when — and carries how many are already
 * out, because a fleet rarely goes in one trip. The count still to deploy is
 * the big figure on the left, so "how many" reads before anything else.
 *
 * Two ways through the same queue:
 *
 * - **By date** (the default) groups by urgency — overdue, this week, next
 *   week, then by month. It answers "what is late and what is next", which is
 *   the question someone opens this screen with.
 * - **By city** groups by place with a running total per city. It answers
 *   "what does Bangalore owe", which is how trucks are actually planned when
 *   a hub loads them.
 *
 * Completed deployments drop to the bottom in both rather than disappearing,
 * so "did we do that one" has an answer.
 */

type View = "date" | "city";

const VIEW_KEY = "moeving.deployments.view";

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
  const [view, setView] = React.useState<View>("date");

  // Which grouping someone works in is a per-person habit, so it survives a
  // reload — the same rule the Pipeline's board/list choice follows.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "date" || saved === "city") setView(saved);
    } catch {
      /* private mode — the default is fine */
    }
  }, []);

  function chooseView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignored */
    }
  }

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

  const isOverdue = (d: Deployment) =>
    Boolean(d.deploymentDate && d.deploymentDate < today);
  const thisMonth = today.slice(0, 7);

  const totals = {
    vehicles: outstanding.reduce((s, d) => s + remaining(d), 0),
    thisMonth: outstanding
      .filter((d) => d.deploymentDate?.slice(0, 7) === thisMonth)
      .reduce((s, d) => s + remaining(d), 0),
    overdue: outstanding.filter(isOverdue).reduce((s, d) => s + remaining(d), 0),
  };

  const groups = React.useMemo<Group<Deployment>[]>(
    () =>
      view === "city"
        ? groupByCity(outstanding)
        : groupByDueDate(outstanding, today),
    [outstanding, view, today],
  );

  const filterCount = cityIds.length + vehicleIds.length;

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Tile label="To deploy" value={num(totals.vehicles)} />
        <Tile label="This month" value={num(totals.thisMonth)} />
        <Tile
          label="Overdue"
          value={num(totals.overdue)}
          tone={totals.overdue ? "bad" : undefined}
        />
      </div>

      {/* One row, and no text that grows: a control row wider than the screen
          stretches the layout viewport and takes the fixed tab bar with it. */}
      <div className="mb-3 flex items-center gap-2">
        <Segmented
          label="Group deployments by"
          className="min-w-0 flex-1"
          value={view}
          onChange={chooseView}
          options={[
            { value: "date", label: "By date" },
            { value: "city", label: "By city" },
          ]}
        />
        <button
          onClick={() => setFiltering(true)}
          aria-label={
            filterCount ? `Filter — ${filterCount} applied` : "Filter"
          }
          className={cn(
            "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
            filterCount
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-line bg-white text-muted",
          )}
        >
          <ListFilter size={18} />
          {filterCount ? (
            <span className="tabular absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
              {filterCount}
            </span>
          ) : null}
        </button>
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
          <div className="mb-2 flex items-baseline gap-2 px-1">
            <h2
              className={cn(
                "flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide",
                g.tone === "bad" ? "text-rose-700" : "text-muted",
              )}
            >
              {view === "city" ? (
                <MapPin size={13} className="shrink-0" aria-hidden="true" />
              ) : null}
              {g.label}
            </h2>
            <span
              className={cn(
                "h-px flex-1",
                g.tone === "bad" ? "bg-rose-200" : "bg-line",
              )}
            />
            {g.note ? (
              <span className="text-[12px] text-muted">{g.note}</span>
            ) : null}
            <span
              className={cn(
                "tabular text-[13px] font-semibold",
                g.tone === "bad" ? "text-rose-700" : "text-ink",
              )}
            >
              {num(g.rows.reduce((s, d) => s + remaining(d), 0))} veh
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

const remaining = (d: Deployment) => d.fleetSize - d.vehiclesDeployed;

/**
 * "in 3 days" / "6 days late" — the bit a date alone makes you work out.
 *
 * Only while it is worth working out: past a month the section heading has
 * already said which month, and "in 70 days" is a number nobody acts on.
 */
function dueNote(date: string | null) {
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} late`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return days <= 30 ? `in ${days} days` : null;
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
  const left = remaining(d);
  const complete = left <= 0;
  const started = d.vehiclesDeployed > 0 && !complete;
  const note = dueNote(d.deploymentDate);

  const head = (
    <div className="flex items-start gap-3">
      {/* How many still to put out: the first thing ops needs off this row. */}
      <div
        className={cn(
          "flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-xl",
          complete
            ? "bg-emerald-50 text-emerald-700"
            : overdue
              ? "bg-rose-50 text-rose-700"
              : started
                ? "bg-amber-50 text-amber-800"
                : "bg-brand-soft text-brand-ink",
        )}
      >
        {complete ? (
          <Check size={22} strokeWidth={2.6} />
        ) : (
          <>
            <span className="tabular text-[21px] font-bold leading-none">
              {left}
            </span>
            <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider">
              left
            </span>
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 text-[16px] font-semibold leading-tight">
          <span className="truncate">{d.accountName}</span>
          {d.isRepeat ? (
            <span className="shrink-0 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">
              Repeat
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-[13.5px] font-semibold">
          {d.fleetSize} × {d.vehicleType ?? "—"}
        </p>
        <p className="mt-0.5 truncate text-[12.5px] text-muted">
          {d.city ?? "No city"} · {d.ownerName.split(" ")[0]}
        </p>
        {started ? (
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className="block h-1.5 w-[56px] shrink-0 overflow-hidden rounded-full bg-line"
              aria-hidden="true"
            >
              <span
                className="block h-1.5 rounded-full bg-amber-500"
                style={{
                  width: `${Math.round((d.vehiclesDeployed / d.fleetSize) * 56)}px`,
                }}
              />
            </span>
            <span className="tabular shrink-0 text-[11.5px] font-semibold text-amber-800">
              {d.vehiclesDeployed}/{d.fleetSize} out
            </span>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            "tabular text-[13.5px] font-bold",
            overdue ? "text-rose-700" : "text-ink",
          )}
        >
          {d.deploymentDate ? formatDateCompact(d.deploymentDate) : "No date"}
        </p>
        {note ? (
          <p
            className={cn(
              "mt-0.5 text-[11px] font-semibold",
              overdue ? "text-rose-700" : "text-muted",
            )}
          >
            {note}
          </p>
        ) : null}
        {complete ? (
          <Badge className="mt-1 bg-emerald-100 text-emerald-800">
            All out
          </Badge>
        ) : null}
      </div>
    </div>
  );

  // The card IS the action. It used to carry a full-width "Record
  // deployment" bar underneath — 56px of identical chrome repeated down the
  // whole list for the one thing this page exists to do. Tapping the row does
  // it now, and sales keep a rail on the right for the deal behind it.
  return (
    <li className="flex items-stretch overflow-hidden rounded-2xl border border-line bg-white">
      <button
        onClick={onRecord}
        aria-label={`Record deployment for ${d.accountName}`}
        className="min-w-0 flex-1 p-3.5 text-left transition active:bg-canvas"
      >
        {head}
      </button>
      {canOpenDeals ? (
        <Link
          href={`/opportunities/${d.id}`}
          aria-label={`Open the ${d.accountName} deal`}
          className="flex w-11 shrink-0 items-center justify-center border-l border-line text-muted active:bg-canvas"
        >
          <ChevronRight size={18} />
        </Link>
      ) : null}
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
