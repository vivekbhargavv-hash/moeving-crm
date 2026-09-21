"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Picker } from "@/components/ui";
import type { PickerOption } from "@/components/ui";
import type { OpportunityFilters } from "@/server/queries";

const FIELD = "h-11 w-full min-w-0 rounded-xl px-2 text-[12px] font-medium";

export function DashboardFilters({
  filters,
  options,
}: {
  filters: OpportunityFilters;
  options: {
    cities: { id: string; name: string }[];
    vehicleTypes: { id: string; name: string }[];
    users: { id: string; name: string }[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function setParam(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    // A router navigation, not a full page load: the shell and the tab bar
    // stay put instead of the whole app being thrown away and rebuilt.
    startTransition(() => router.push(url.pathname + url.search, { scroll: false }));
  }

  const all = (label: string, rows: { id: string; name: string }[]): PickerOption[] => [
    { value: "", label },
    ...rows.map((r) => ({ value: r.id, label: r.name })),
  ];

  return (
    /* Three equal columns rather than a scroller: as a row of fixed-width
       controls the third one sat half off the screen, reading as broken
       rather than as something you could swipe. */
    <div
      className="mb-4 grid grid-cols-3 gap-2"
      aria-busy={pending || undefined}
    >
      <Picker
        label="Deal owner"
        className={FIELD}
        value={filters.ownerUserId ?? ""}
        onChange={(v) => setParam("spoc", v)}
        options={all("All owners", options.users)}
      />
      <Picker
        label="City"
        className={FIELD}
        value={filters.cityId ?? ""}
        onChange={(v) => setParam("city", v)}
        options={all("All cities", options.cities)}
      />
      <Picker
        label="Vehicle type"
        className={FIELD}
        value={filters.vehicleTypeId ?? ""}
        onChange={(v) => setParam("vehicle", v)}
        options={all("All vehicles", options.vehicleTypes)}
      />
    </div>
  );
}
