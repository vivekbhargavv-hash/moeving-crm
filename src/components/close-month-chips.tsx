"use client";

import * as React from "react";

import { cn, monthLabelShort } from "@/lib/utils";

/**
 * The expected closing month as a row of chips — required on a new deal.
 *
 * Vivek, 9 Oct: a deal with no closing month is in no column of the Sales
 * Closure Forecast, so 16 open deals (49 vehicles) were invisible there. New
 * deals must say when they are expected to close; the server refuses one that
 * does not (`createOpportunity`), and this stops the form first.
 *
 * Same trick as a required `Picker`: the value posts from a visually hidden
 * TEXT input, because browsers skip `type="hidden"` when validating, and the
 * page shows its own message under the chips instead of the browser's bubble
 * pointing at an input nobody can see.
 */
export function CloseMonthChips({
  months,
  value,
  onChange,
  name = "expectedCloseMonth",
}: {
  months: string[];
  value: string;
  onChange: (month: string) => void;
  name?: string;
}) {
  const [missing, setMissing] = React.useState(false);
  const first = React.useRef<HTMLButtonElement>(null);

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
        Expected closing month
      </p>
      <div
        role="group"
        aria-label="Expected closing month"
        aria-invalid={missing || undefined}
        className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {months.map((m, i) => (
          <button
            key={m}
            ref={i === 0 ? first : undefined}
            type="button"
            aria-pressed={value === m}
            onClick={() => {
              onChange(m);
              setMissing(false);
            }}
            className={cn(
              "h-11 shrink-0 rounded-xl border px-4 text-sm font-medium transition",
              value === m
                ? "border-brand bg-brand-soft text-brand-ink"
                : missing
                  ? "border-rose-400 bg-white text-muted"
                  : "border-line bg-white text-muted",
            )}
          >
            {monthLabelShort(m)}
          </button>
        ))}
      </div>
      <input
        name={name}
        value={value}
        required
        // Not readOnly: a read-only input is skipped by validation too.
        onChange={() => {}}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onInvalid={(e) => {
          e.preventDefault();
          setMissing(true);
          first.current?.focus();
        }}
      />
      {missing ? (
        <p className="mt-1 text-xs font-medium text-rose-700">
          Pick the month this deal is expected to close.
        </p>
      ) : null}
    </div>
  );
}
