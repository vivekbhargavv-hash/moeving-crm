"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import {
  Button,
  Field,
  Input,
  PickedDate,
  PickerField,
  Sheet,
  Textarea,
} from "@/components/ui";
import { COST_FIELDS, STAGES, STAGE_MAP } from "@/lib/constants";
import type { SalesStage } from "@/db/schema";
import { cn, inr, inrCompact } from "@/lib/utils";
import { changeStage, loadUnitEconomics } from "@/server/actions";

export type StageTarget = {
  id: string;
  name: string;
  stage: SalesStage;
  /** Monthly value of the whole deal: price x fleet. */
  value: number;
  /** Rent for one vehicle per month — seeds revenue on Closed Won. */
  price: number | null;
  fleetSize: number;
  /**
   * The day the trucks are due, if anyone has said yet. Offered at
   * Contracting and required at Closed Won, so the Won sheet arrives already
   * filled for a deal that pencilled one in weeks earlier.
   */
  deploymentDate?: string | null;
};

/**
 * Two taps: open, pick. Won and Lost then ask for the one extra block the
 * business needs; Contracting is *offered* one, which is a different thing.
 *
 * Contracting means verbally agreed with paperwork in flight — the first
 * moment anybody can honestly say when the trucks are wanted, and weeks
 * before the win. Asking then is worth a lot to ops and must not become a
 * gate: a deal owner who does not know yet moves the stage and says nothing.
 * By Closed Won it is mandatory, and a date given here satisfies it.
 */
export function StageChanger({
  target,
  lostReasons,
  onClose,
}: {
  target: StageTarget | null;
  lostReasons: { id: string; label: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<
    "pick" | "won" | "lost" | "contracting"
  >("pick");
  const [error, setError] = React.useState<string | null>(null);
  const [costs, setCosts] = React.useState<Record<string, string>>({});
  // Ops plans against this. It is asked here because winning the deal is the
  // moment anyone actually knows it.
  const [deployDate, setDeployDate] = React.useState("");
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [revenue, setRevenue] = React.useState("");
  const [loadingSheet, setLoadingSheet] = React.useState(false);
  /** Cost lines showing an admin default rather than something typed here. */
  const [prefilled, setPrefilled] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (target) {
      setMode("pick");
      setError(null);
      setCosts({});
      setPrefilled([]);
      setDeployDate(target.deploymentDate ?? "");
      setRevenue(target.price ? String(target.price) : "");
    }
  }, [target]);

  const id = target?.id;

  /**
   * A deal costed earlier in the pipeline arrives here with its sheet already
   * filled; closing it should be a glance and a date, not a retype. The
   * figures are fetched when the Won sheet opens rather than carried on every
   * pipeline card, which would put eight more columns on a 250-row table to
   * serve one screen.
   */
  React.useEffect(() => {
    if (!id || mode !== "won") return;
    let live = true;
    setLoadingSheet(true);
    loadUnitEconomics(id)
      .then((result) => {
        if (!live || !result.ok || !result.data) return;
        const { sheet, defaults } = result.data;
        const { revenue: storedRevenue, ...storedCosts } = sheet;
        // Only where the deal carries no price at all does a stored revenue
        // still have something to say.
        if (!target?.price && storedRevenue !== null) {
          setRevenue(String(storedRevenue));
        }
        /**
         * What the deal already carries wins; the admin's defaults fill the
         * blanks. Nothing typed is ever overwritten by a rule — the rule is
         * a starting point, not an opinion about a deal someone has costed.
         */
        const filled: Record<string, string> = {};
        for (const [k, v] of Object.entries(defaults)) {
          if (v !== undefined) filled[k] = String(v);
        }
        for (const [k, v] of Object.entries(storedCosts)) {
          if (v !== null) filled[k] = String(v);
        }
        setCosts(filled);
        setPrefilled(
          Object.keys(defaults).filter(
            (k) => storedCosts[k as keyof typeof storedCosts] === null,
          ),
        );
      })
      .catch(() => {
        // Prefill is a convenience; the sheet still works typed by hand.
      })
      .finally(() => {
        if (live) setLoadingSheet(false);
      });
    return () => {
      live = false;
    };
  }, [id, mode]);

  if (!target) return null;

  const totalCost = COST_FIELDS.reduce(
    (sum, f) => sum + (Number(costs[f.key] || 0) || 0),
    0,
  );
  // Everything the deal owner types is per vehicle per month; the deal-level
  // numbers underneath are simply that times the fleet.
  const revenueNum = Number(revenue || 0);
  const margin = revenueNum - totalCost;
  const marginPct = revenueNum ? (margin / revenueNum) * 100 : null;
  const fleet = target.fleetSize;

  function pick(stage: SalesStage) {
    if (stage === target!.stage) return onClose();
    if (stage === "closed_won") return setMode("won");
    if (stage === "closed_lost") return setMode("lost");
    if (stage === "contracting") return setMode("contracting");
    commit(stage);
  }

  function commit(stage: SalesStage, formData?: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await changeStage(target!.id, stage, formData);
      if (!result.ok) return setError(result.error);
      if (result.data?.needs) {
        setError(
          result.data.needs === "contracting"
            ? "That is not a real date — check it and try again."
            : "Fill in the fields below to close this deal.",
        );
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const title =
    mode === "won"
      ? "Close as Won"
      : mode === "lost"
        ? "Close as Lost"
        : mode === "contracting"
          ? "Move to Contracting"
          : "Move stage";

  return (
    <Sheet open onClose={onClose} title={title}>
      <p className="-mt-1 mb-4 truncate text-sm text-muted">{target.name}</p>

      {mode === "pick" ? (
        <div className="grid gap-2">
          {STAGES.map((s) => {
            const current = s.value === target.stage;
            return (
              <button
                key={s.value}
                disabled={pending}
                onClick={() => pick(s.value)}
                className={cn(
                  "flex h-14 items-center gap-3 rounded-xl border px-4 text-left text-[15px] font-medium transition active:scale-[0.99]",
                  current
                    ? "border-brand bg-brand-soft text-brand-ink"
                    : "border-line hover:bg-canvas",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} />
                {s.label}
                {current ? <Check size={18} className="ml-auto" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {mode === "won" ? (
        <form
          action={(fd) => commit("closed_won", fd)}
          className="space-y-4"
          id="won-form"
        >
          <div className="rounded-xl bg-brand-soft/60 px-4 py-3 text-sm">
            <p className="font-medium text-brand-ink">
              Unit economics — per vehicle, per month
            </p>
            <p className="mt-0.5 text-muted">
              Quoted at {target.price ? inr(target.price) : "—"} per vehicle ·{" "}
              {fleet} {fleet === 1 ? "vehicle" : "vehicles"} in this deal.
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              {loadingSheet
                ? "Loading what this deal already has…"
                : prefilled.length
                  ? `${prefilled.length} ${prefilled.length === 1 ? "figure is" : "figures are"} the standard rate for this vehicle and contract — check them, change what differs, and close.`
                  : "Anything already costed on the deal is filled in below — check it, correct it, and close."}
            </p>
          </div>

          <Field
            label="Expected deployment date"
            hint="The day the vehicles are due on the road."
          >
            <Input
              type="date"
              name="deploymentDate"
              required
              min={today}
              value={deployDate}
              onChange={(e) => setDeployDate(e.target.value)}
            />
            <PickedDate value={deployDate} />
          </Field>

          {/* The price per vehicle IS the revenue per vehicle — one figure. It
              is editable here because winning is the moment a rate is finally
              agreed, and saving writes it back to the deal's price. */}
          <Field
            label="Price per vehicle / month"
            hint="What the customer pays for one vehicle — this is the deal's revenue."
          >
            <Input
              name="revenue"
              inputMode="numeric"
              required
              value={revenue}
              onChange={(e) => setRevenue(e.target.value.replace(/\D/g, ""))}
            />
          </Field>

          <p className="!mt-5 text-[13px] font-medium text-muted">
            Monthly cost of running one vehicle
          </p>

          <div className="grid grid-cols-2 gap-3">
            {COST_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                hint={prefilled.includes(f.key) ? "Standard rate" : undefined}
              >
                <Input
                  name={f.key}
                  inputMode="numeric"
                  required
                  placeholder="₹0"
                  value={costs[f.key] ?? ""}
                  onChange={(e) => {
                    // Touching a figure makes it this deal's own.
                    setPrefilled((p) => p.filter((k) => k !== f.key));
                    setCosts((c) => ({
                      ...c,
                      [f.key]: e.target.value.replace(/\D/g, ""),
                    }));
                  }}
                />
              </Field>
            ))}
          </div>

          <dl className="rounded-xl bg-canvas p-4 text-sm">
            <Row label="Cost per vehicle" value={inr(totalCost)} />
            <Row label="Margin per vehicle" value={inr(margin)} strong />
            <Row
              label="Margin %"
              value={marginPct === null ? "—" : `${marginPct.toFixed(1)}%`}
              tone={
                marginPct === null
                  ? ""
                  : marginPct >= 0
                    ? "text-emerald-700"
                    : "text-rose-700"
              }
            />
            <div className="my-2 border-t border-line" />
            <p className="pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">
              Whole deal × {fleet}
            </p>
            <Row label="Revenue / month" value={inr(revenueNum * fleet)} />
            <Row label="Cost / month" value={inr(totalCost * fleet)} />
            <Row label="Gross margin / month" value={inr(margin * fleet)} strong />
          </dl>

          {error ? <p className="text-sm text-rose-700">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("pick")}>
              Back
            </Button>
            <Button
              variant="brand"
              className="flex-1"
              disabled={pending || !deployDate}
            >
              {pending ? "Saving…" : "Mark Won"}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "contracting" ? (
        <form action={(fd) => commit("contracting", fd)} className="space-y-4">
          <div className="rounded-xl bg-brand-soft/60 px-4 py-3 text-sm">
            <p className="font-medium text-brand-ink">
              When are the vehicles wanted?
            </p>
            <p className="mt-0.5 text-muted">
              Optional. Paperwork is in flight, so this is the first point
              anybody can say — and it gives ops weeks of warning instead of
              finding out the day the deal is won. You are asked again, and
              required to answer, at Closed Won.
            </p>
          </div>

          <Field
            label="Expected deployment date"
            hint="Leave it blank if nobody has said yet."
          >
            <Input
              type="date"
              name="deploymentDate"
              min={today}
              value={deployDate}
              onChange={(e) => setDeployDate(e.target.value)}
            />
            <PickedDate value={deployDate} />
          </Field>

          {error ? <p className="text-sm text-rose-700">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("pick")}>
              Back
            </Button>
            <Button variant="brand" className="flex-1" disabled={pending}>
              {pending
                ? "Saving…"
                : deployDate
                  ? "Move to Contracting"
                  : "Move without a date"}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "lost" ? (
        <form action={(fd) => commit("closed_lost", fd)} className="space-y-4">
          <Field label="Why did we lose it?">
            <PickerField
              label="Why did we lose it?"
              name="lostReasonId"
              required
              placeholder="Select a reason"
              options={lostReasons.map((r) => ({
                value: r.id,
                label: r.label,
              }))}
            />
          </Field>
          <Field label="Anything worth remembering?">
            <Textarea name="lostReasonNote" placeholder="Optional" />
          </Field>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("pick")}>
              Back
            </Button>
            <Button variant="danger" className="flex-1" disabled={pending}>
              {pending ? "Saving…" : "Mark Lost"}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "pick" && target.value ? (
        <p className="mt-4 text-center text-xs text-muted">
          Monthly value {inrCompact(target.value)} ·{" "}
          {STAGE_MAP[target.stage].label} today
        </p>
      ) : null}
    </Sheet>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular", strong && "font-semibold", tone)}>{value}</dd>
    </div>
  );
}
