"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";

import { Segmented } from "@/components/ui";
import { buildFunnel, within, type Funnel } from "@/lib/lead-funnel";
import { cn, num } from "@/lib/utils";
import type { LeadRow } from "@/server/queries";

/**
 * What the inbound desk produced, and how much of it turned into business.
 *
 * The headline is deliberately **won**, not converted. A conversion rate that
 * stops at "a deal was raised" flatters the desk and answers the wrong
 * question — raising a deal costs nothing, and the enquiry only paid for
 * itself once the trucks were sold. Converted is shown right beside it, so
 * the drop between the two is visible rather than argued about.
 *
 * Every rate is out of enquiries in the window, including the ones nobody has
 * rung back yet. Measuring each step against the one before it would let a
 * desk that called two leads and converted both report 100%.
 */
const WINDOWS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
] as const;

type WindowKey = (typeof WINDOWS)[number]["value"];

const WINDOW_KEY = "moeving.leads.funnel";

export function LeadFunnel({ leads }: { leads: LeadRow[] }) {
  const [windowKey, setWindowKey] = React.useState<WindowKey>("90");
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(WINDOW_KEY);
      if (saved === "30" || saved === "90" || saved === "all") setWindowKey(saved);
    } catch {
      /* private mode — the default is fine */
    }
  }, []);

  function choose(next: WindowKey) {
    setWindowKey(next);
    try {
      localStorage.setItem(WINDOW_KEY, next);
    } catch {
      /* ignored */
    }
  }

  const funnel = React.useMemo(() => {
    const days = windowKey === "all" ? null : Number(windowKey);
    return buildFunnel(within(leads, days));
  }, [leads, windowKey]);

  if (funnel.enquiries === 0 && windowKey === "all") return null;

  return (
    <section className="mb-4 rounded-2xl border border-line bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left active:bg-canvas"
      >
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          Inbound conversion
        </h2>
        <span className="tabular ml-auto text-[15px] font-bold">
          {rate(funnel.wonPct)}
        </span>
        <span className="text-[12px] text-muted">won</span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-muted transition", open && "rotate-180")}
        />
      </button>

      <div className="border-t border-line px-4 py-3">
        <Segmented
          label="Period"
          className="mb-3 sm:w-[280px]"
          value={windowKey}
          onChange={choose}
          options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
        />

        <Steps funnel={funnel} />

        {open ? <Detail funnel={funnel} /> : null}
      </div>
    </section>
  );
}

/** The four counts, each as a share of the enquiries that came in. */
function Steps({ funnel }: { funnel: Funnel }) {
  const steps = [
    { label: "Enquiries", value: funnel.enquiries, pct: null as number | null },
    { label: "Called back", value: funnel.called, pct: funnel.calledPct },
    { label: "Became deals", value: funnel.converted, pct: funnel.convertedPct },
    { label: "Won", value: funnel.won, pct: funnel.wonPct, good: true },
  ];

  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {steps.map((s) => (
        <li
          key={s.label}
          className={cn(
            "rounded-xl px-3 py-2.5",
            s.good ? "bg-emerald-50" : "bg-canvas",
          )}
        >
          <p
            className={cn(
              "tabular text-[20px] font-bold leading-none",
              s.good && "text-emerald-800",
            )}
          >
            {num(s.value)}
          </p>
          <p className="mt-1 flex items-baseline gap-1.5 text-[11.5px] leading-tight text-muted">
            <span className="truncate">{s.label}</span>
            {s.pct === null ? null : (
              <span
                className={cn(
                  "tabular ml-auto shrink-0 font-semibold",
                  s.good ? "text-emerald-800" : "text-ink",
                )}
              >
                {rate(s.pct)}
              </span>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Detail({ funnel }: { funnel: Funnel }) {
  const rows: { label: string; value: string; note?: string }[] = [
    {
      label: "Not called back yet",
      value: num(funnel.uncalled),
      note: "of the enquiries in this window",
    },
    { label: "Qualified", value: `${num(funnel.qualified)} · ${rate(funnel.qualifiedPct)}` },
    { label: "Not qualified", value: num(funnel.notQualified) },
    {
      label: "Won, of the deals raised",
      value: rate(funnel.wonOfConvertedPct),
      note: "how good the deals this inbound produces are, rather than how many there are",
    },
    { label: "Lost, of the deals raised", value: num(funnel.lost) },
    { label: "Still open in the pipeline", value: num(funnel.open) },
    {
      label: "Typical wait for a callback",
      value:
        funnel.medianHoursToCall === null
          ? "—"
          : formatHours(funnel.medianHoursToCall),
      note: "median, so one badly late call does not move it",
    },
    {
      label: "Typical time to become a deal",
      value:
        funnel.medianDaysToConvert === null
          ? "—"
          : `${funnel.medianDaysToConvert.toFixed(1)} days`,
    },
  ];

  return (
    <dl className="mt-3 border-t border-line pt-1 text-[13px]">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0"
        >
          <dt className="min-w-0 text-muted">
            {r.label}
            {r.note ? (
              <span className="block text-[11.5px] opacity-80">{r.note}</span>
            ) : null}
          </dt>
          <dd className="tabular shrink-0 font-semibold">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function rate(value: number | null) {
  return value === null ? "—" : `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function formatHours(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}
