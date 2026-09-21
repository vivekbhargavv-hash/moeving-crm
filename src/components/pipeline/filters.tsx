"use client";

import * as React from "react";

import { Button, Sheet } from "@/components/ui";
import type { SalesStage } from "@/db/schema";
import { STAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Stage · City · Deal Owner · Vehicle type, in one sheet.
 *
 * Every group is multi-select and an empty group means "all of them", so the
 * common case — glance, tap two chips, done — costs no scrolling through four
 * dropdowns. Chips rather than selects for the reason the owner filter became
 * an icon button: a native select sizes itself to its longest option and
 * quietly stretches the layout viewport on a phone.
 */

export type Filters = {
  stages: SalesStage[];
  cityIds: string[];
  ownerIds: string[];
  vehicleTypeIds: string[];
};

export const EMPTY_FILTERS: Filters = {
  stages: [],
  cityIds: [],
  ownerIds: [],
  vehicleTypeIds: [],
};

export function activeFilterCount(f: Filters) {
  return (
    f.stages.length + f.cityIds.length + f.ownerIds.length + f.vehicleTypeIds.length
  );
}

type Option = { id: string; label: string };

export function PipelineFilterSheet({
  open,
  onClose,
  value,
  onChange,
  cities,
  owners,
  vehicleTypes,
  currentUserId,
  matchCount,
}: {
  open: boolean;
  onClose: () => void;
  value: Filters;
  onChange: (next: Filters) => void;
  cities: Option[];
  owners: Option[];
  vehicleTypes: Option[];
  currentUserId: string;
  matchCount: number;
}) {
  if (!open) return null;

  /** Toggling within a group; an empty group means all of them. */
  function toggle<K extends keyof Filters>(key: K, id: string) {
    const current = value[key] as string[];
    const next = current.includes(id)
      ? current.filter((v) => v !== id)
      : [...current, id];
    onChange({ ...value, [key]: next });
  }

  // Clearing returns to the default view — your own deals — not to everyone.
  function clearAll() {
    onChange({ ...EMPTY_FILTERS, ownerIds: [currentUserId] });
  }

  const count = activeFilterCount(value);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Filter deals"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={clearAll} disabled={!count}>
            Clear
          </Button>
          <Button type="button" variant="brand" className="flex-1" onClick={onClose}>
            Show {matchCount} {matchCount === 1 ? "deal" : "deals"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Group
          label="Stage"
          options={STAGES.map((s) => ({ id: s.value, label: s.label }))}
          selected={value.stages}
          onToggle={(id) => toggle("stages", id)}
          dots={Object.fromEntries(STAGES.map((s) => [s.value, s.dot]))}
        />
        <Group
          label="City"
          options={cities}
          selected={value.cityIds}
          onToggle={(id) => toggle("cityIds", id)}
        />
        <Group
          label="Deal Owner"
          options={owners.map((o) =>
            o.id === currentUserId ? { ...o, label: `${o.label} (me)` } : o,
          )}
          selected={value.ownerIds}
          onToggle={(id) => toggle("ownerIds", id)}
        />
        <Group
          label="Vehicle type"
          options={vehicleTypes}
          selected={value.vehicleTypeIds}
          onToggle={(id) => toggle("vehicleTypeIds", id)}
        />
      </div>
    </Sheet>
  );
}

function Group({
  label,
  options,
  selected,
  onToggle,
  dots,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
  dots?: Record<string, string>;
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
                "flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition active:scale-[0.98]",
                on
                  ? "border-brand bg-brand-soft text-brand-ink"
                  : "border-line bg-white text-muted",
              )}
            >
              {dots?.[o.id] ? (
                <span className={cn("h-2 w-2 rounded-full", dots[o.id])} />
              ) : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
