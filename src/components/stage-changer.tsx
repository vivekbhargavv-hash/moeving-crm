"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button, Field, Input, Select, Sheet, Textarea } from "@/components/ui";
import { COST_FIELDS, STAGES, STAGE_MAP } from "@/lib/constants";
import type { SalesStage } from "@/db/schema";
import { cn, inr, inrCompact, monthLabelShort, upcomingMonths } from "@/lib/utils";
import { changeStage } from "@/server/actions";

export type StageTarget = {
  id: string;
  name: string;
  stage: SalesStage;
  /** Monthly value of the whole deal: price x fleet. */
  value: number;
  /** Rent for one vehicle per month — seeds revenue on Closed Won. */
  price: number | null;
  fleetSize: number;
};

/**
 * Two taps: open, pick. Won and Lost then ask for the one extra block the
 * business needs, and nothing more.
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
  const [mode, setMode] = React.useState<"pick" | "won" | "lost">("pick");
  const [error, setError] = React.useState<string | null>(null);
  const [costs, setCosts] = React.useState<Record<string, string>>({});
  // Ops plans against this. It is asked here because winning the deal is the
  // moment anyone actually knows it.
  const [deployMonth, setDeployMonth] = React.useState("");
  const months = React.useMemo(() => upcomingMonths(6), []);
  const [revenue, setRevenue] = React.useState("");

  React.useEffect(() => {
    if (target) {
      setMode("pick");
      setError(null);
      setCosts({});
      setDeployMonth("");
      setRevenue(target.price ? String(target.price) : "");
    }
  }, [target]);

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
    commit(stage);
  }

  function commit(stage: SalesStage, formData?: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await changeStage(target!.id, stage, formData);
      if (!result.ok) return setError(result.error);
      if (result.data?.needs) {
        setError("Fill in the fields below to close this deal.");
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
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
              Expected deployment month
            </p>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {months.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={deployMonth === m}
                  onClick={() => setDeployMonth(m)}
                  className={cn(
                    "h-11 shrink-0 rounded-xl border px-4 text-sm font-medium transition",
                    deployMonth === m
                      ? "border-brand bg-brand-soft text-brand-ink"
                      : "border-line bg-white text-muted",
                  )}
                >
                  {monthLabelShort(m)}
                </button>
              ))}
            </div>
            <input type="hidden" name="deploymentMonth" value={deployMonth} />
            <p className="mt-1.5 text-[12px] text-muted">
              When the vehicles are due on the road. This is what the operations
              team works from.
            </p>
          </div>

          <Field
            label="Revenue per vehicle / month"
            hint="Pre-filled from the quoted price. Change it if the closing rate differs."
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
              <Field key={f.key} label={f.label}>
                <Input
                  name={f.key}
                  inputMode="numeric"
                  required
                  placeholder="₹0"
                  value={costs[f.key] ?? ""}
                  onChange={(e) =>
                    setCosts((c) => ({
                      ...c,
                      [f.key]: e.target.value.replace(/\D/g, ""),
                    }))
                  }
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
              disabled={pending || !deployMonth}
            >
              {pending ? "Saving…" : "Mark Won"}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "lost" ? (
        <form action={(fd) => commit("closed_lost", fd)} className="space-y-4">
          <Field label="Why did we lose it?">
            <Select name="lostReasonId" required defaultValue="">
              <option value="" disabled>
                Select a reason
              </option>
              {lostReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
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
