"use server";

import { requireSales } from "@/server/auth";
import {
  getForecastDrilldown,
  getWinsDrilldown,
  type OpportunityFilters,
} from "@/server/queries";

/*
 * Both drill-downs carry deal values, and the wins one carries revenue and
 * margin. The Forecast page is refused to ops and NOC by `requireSales()`, and
 * a server action is its own door, so it has to be refused here too.
 */

/** Drill-down is fetched on demand so the grid stays light on a phone. */
export async function loadDrilldown(
  cityId: string | null,
  month: string,
  filters: OpportunityFilters,
) {
  await requireSales();
  return getForecastDrilldown(cityId, month, filters);
}

/** Accounts one owner closed in one month, for the wins drill-down. */
export async function loadWinsDrilldown(ownerId: string, month: string) {
  await requireSales();
  return getWinsDrilldown(ownerId, month);
}
