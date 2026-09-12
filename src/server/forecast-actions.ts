"use server";

import {
  getForecastDrilldown,
  getWinsDrilldown,
  type OpportunityFilters,
} from "@/server/queries";

/** Drill-down is fetched on demand so the grid stays light on a phone. */
export async function loadDrilldown(
  cityId: string | null,
  month: string,
  filters: OpportunityFilters,
) {
  return getForecastDrilldown(cityId, month, filters);
}

/** Accounts one owner closed in one month, for the wins drill-down. */
export async function loadWinsDrilldown(ownerId: string, month: string) {
  return getWinsDrilldown(ownerId, month);
}
