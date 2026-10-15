import type { SalesStage } from "@/db/schema";
import { STAGE_MAP } from "@/lib/constants";
import { csvResponse, listParam } from "@/lib/csv";
import { FORECAST_MONTHS, OVERDUE } from "@/lib/forecast";
import { monthLabelLong, todayInIndia, upcomingMonths } from "@/lib/utils";
import { requireSession } from "@/server/auth";
import { listForecastDeals } from "@/server/queries";

export const dynamic = "force-dynamic";

/**
 * The Sales Closure Forecast as a spreadsheet: one row per open deal, with
 * the column it lands in on the grid.
 *
 * One row per deal rather than the grid itself, so it can be sorted, filtered
 * and pivoted — a pivot of City × Forecast month on Vehicles IS the grid. It
 * honours the same filters the screen has applied (`?city=&vehicle=&spoc=&stage=`).
 */
export async function GET(request: Request) {
  const session = await requireSession();
  // Revenue figures: the same people who may open the Forecast page.
  if (session.role === "ops" || session.role === "noc") {
    return new Response("Not available for this role", { status: 403 });
  }
  const url = new URL(request.url);

  // India's month, as the page uses — see forecast/page.tsx.
  const months = upcomingMonths(FORECAST_MONTHS, new Date(todayInIndia()));
  const deals = await listForecastDeals(months, {
    cityIds: listParam(url, "city"),
    vehicleTypeIds: listParam(url, "vehicle"),
    ownerIds: listParam(url, "spoc"),
    stages: listParam(url, "stage") as SalesStage[],
  });

  const header = [
    "Forecast month",
    "Expected closing",
    "Customer",
    "Deal",
    "City",
    "Vehicle type",
    "Stage",
    "Deal Owner",
    "Vehicles",
    "Price per vehicle per month",
    "Monthly deal value",
  ];

  const rows = deals.map((d) => [
    d.column === OVERDUE
      ? "Overdue"
      : d.column
        ? monthLabelLong(d.column)
        : "No closing month",
    d.expectedCloseDate?.slice(0, 7) ?? "",
    d.accountName,
    d.name,
    d.city ?? "",
    d.vehicleType ?? "",
    STAGE_MAP[d.stage].label,
    d.ownerName,
    d.fleetSize,
    d.price,
    d.price === null ? "" : d.price * d.fleetSize,
  ]);

  return csvResponse("sales-closure-forecast", header, rows);
}
