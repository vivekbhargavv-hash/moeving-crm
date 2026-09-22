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
  return (
    <FilterSheetBody
      // Each opening starts from the filters actually in force, so an
      // abandoned sheet leaves nothing behind.
      key={JSON.stringify(value)}
      onClose={onClose}
      value={value}
      onChange={onChange}
      cities={cities}
      owners={owners}
      vehicleTypes={vehicleTypes}
      currentUserId={currentUserId}
      matchCount={matchCount}
    />
  );
}

/**
 * The chips are local until you press the button.
 *
 * Filters live in the URL, so applying one is a navigation: a server render
 * and a query. Applying on every tap meant picking a stage, two cities and an
 * owner cost four of them in a row, each one re-rendering the list behind the
 * sheet you were still using. Now the sheet keeps a draft and spends a single
 * round trip when you say you are done.
 */
function FilterSheetBody({
  onClose,
  value,
  onChange,
  cities,
  owners,
  vehicleTypes,
  currentUserId,
  matchCount,
}: {
  onClose: () => void;
  value: Filters;
  onChange: (next: Filters) => void;
  cities: Option[];
  owners: Option[];
  vehicleTypes: Option[];
  currentUserId: string;
  matchCount: number;
}) {
  const [draft, setDraft] = React.useState<Filters>(value);

  /** Toggling within a group; an empty group means all of them. */
  function toggle<K extends keyof Filters>(key: K, id: string) {
    const current = draft[key] as string[];
    const next = current.includes(id)
      ? current.filter((v) => v !== id)
      : [...current, id];
    setDraft({ ...draft, [key]: next });
  }

  // Clearing returns to the default view — your own deals — not to everyone.
  function clearAll() {
    setDraft({ ...EMPTY_FILTERS, ownerIds: [currentUserId] });
  }

  const count = activeFilterCount(draft);
  const touched = JSON.stringify(draft) !== JSON.stringify(value);

  function apply() {
    // Nothing moved, so nothing is worth a round trip.
    if (!touched) return onClose();
    onChange(draft);
    onClose();
  }

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
          {/* The count is what the list behind this sheet actually holds, so
              it is only honest until a chip moves. After that the button says
              what it will do instead of guessing a number. */}
          <Button type="button" variant="brand" className="flex-1" onClick={apply}>
            {touched
              ? "Apply filters"
              : `Show ${matchCount} ${matchCount === 1 ? "deal" : "deals"}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Group
          label="Stage"
          options={STAGES.map((s) => ({ id: s.value, label: s.label }))}
          selected={draft.stages}
          onToggle={(id) => toggle("stages", id)}
          dots={Object.fromEntries(STAGES.map((s) => [s.value, s.dot]))}
        />
        <Group
          label="City"
          options={cities}
          selected={draft.cityIds}
          onToggle={(id) => toggle("cityIds", id)}
        />
        <Group
          label="Deal Owner"
          options={owners.map((o) =>
            o.id === currentUserId ? { ...o, label: `${o.label} (me)` } : o,
          )}
          selected={draft.ownerIds}
          onToggle={(id) => toggle("ownerIds", id)}
        />
        <Group
          label="Vehicle type"
          options={vehicleTypes}
          selected={draft.vehicleTypeIds}
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
