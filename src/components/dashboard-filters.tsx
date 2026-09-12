"use client";

import { Select } from "@/components/ui";
import type { OpportunityFilters } from "@/server/queries";

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
  function setParam(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.location.href = url.toString();
  }

  return (
    <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
      <Select
        className="h-12 w-[7rem] shrink-0 rounded-2xl text-[13px] font-medium"
        value={filters.ownerUserId ?? ""}
        onChange={(e) => setParam("spoc", e.target.value)}
      >
        <option value="">All owners</option>
        {options.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <Select
        className="h-12 w-[7rem] shrink-0 rounded-2xl text-[13px] font-medium"
        value={filters.cityId ?? ""}
        onChange={(e) => setParam("city", e.target.value)}
      >
        <option value="">All cities</option>
        {options.cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        className="h-12 w-[7rem] shrink-0 rounded-2xl text-[13px] font-medium"
        value={filters.vehicleTypeId ?? ""}
        onChange={(e) => setParam("vehicle", e.target.value)}
      >
        <option value="">All vehicles</option>
        {options.vehicleTypes.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
