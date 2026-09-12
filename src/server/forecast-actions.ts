"use server";

import { getForecastDrilldown, type OpportunityFilters } from "@/server/queries";

/** Drill-down is fetched on demand so the grid stays light on a phone. */
export async function loadDrilldown(
  cityId: string | null,
  month: string,
  filters: OpportunityFilters,
) {
  return getForecastDrilldown(cityId, month, filters);
}
