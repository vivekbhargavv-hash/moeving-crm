import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import type { SalesStage } from "@/db/schema";
import {
  accounts,
  cities,
  lostReasons,
  opportunities,
  users,
  vehicleTypes,
} from "@/db/schema";
import {
  CHARGING_SCOPE_LABEL,
  COST_FIELDS,
  DRIVER_TYPE_LABEL,
  STAGE_MAP,
} from "@/lib/constants";
import { requireSession } from "@/server/auth";

export const dynamic = "force-dynamic";

/** RFC 4180: quote everything, double any inner quote. Excel opens it cleanly. */
function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Every deal as a spreadsheet, scoped to the caller's organization.
 *
 * Costs are exported per vehicle per month, exactly as they are stored and
 * shown, with the deal-level totals alongside so nobody has to multiply by
 * hand — or guess which basis a column is on.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  const url = new URL(request.url);
  const stage = url.searchParams.get("stage") as SalesStage | null;

  const rows = await db
    .select({
      opp: opportunities,
      accountName: accounts.name,
      city: cities.name,
      vehicleType: vehicleTypes.name,
      ownerName: users.name,
      lostReason: lostReasons.label,
    })
    .from(opportunities)
    .innerJoin(accounts, eq(accounts.id, opportunities.accountId))
    .innerJoin(users, eq(users.id, opportunities.ownerUserId))
    .leftJoin(cities, eq(cities.id, opportunities.cityId))
    .leftJoin(vehicleTypes, eq(vehicleTypes.id, opportunities.vehicleTypeId))
    .leftJoin(lostReasons, eq(lostReasons.id, opportunities.lostReasonId))
    .where(
      and(
        eq(opportunities.organizationId, session.organizationId),
        stage ? eq(opportunities.stage, stage) : undefined,
      ),
    )
    .orderBy(asc(opportunities.expectedCloseDate));

  const header = [
    "Customer",
    "Opportunity",
    "Stage",
    "City",
    "Vehicle type",
    "Driver type",
    "Charging scope",
    "Fleet size",
    "Price per vehicle per month",
    "Monthly deal value",
    "Expected closing",
    "Deal Owner",
    "Closed on",
    "Lost reason",
    "Revenue per vehicle",
    ...COST_FIELDS.map((f) => `${f.label} per vehicle`),
    "Cost per vehicle",
    "Margin per vehicle",
    "Total revenue per month",
    "Total cost per month",
    "Gross margin per month",
    "Margin %",
    "Notes",
  ];

  const body = rows.map(({ opp, ...joined }) =>
    [
      joined.accountName,
      opp.name,
      STAGE_MAP[opp.stage].label,
      joined.city,
      joined.vehicleType,
      opp.driverType ? DRIVER_TYPE_LABEL[opp.driverType] : "",
      opp.chargingScope ? CHARGING_SCOPE_LABEL[opp.chargingScope] : "",
      opp.fleetSize,
      opp.price,
      (opp.price ?? 0) * opp.fleetSize,
      opp.expectedCloseDate,
      joined.ownerName,
      opp.closedAt ? opp.closedAt.toISOString().slice(0, 10) : "",
      joined.lostReason,
      opp.revenue,
      ...COST_FIELDS.map((f) => opp[f.key]),
      opp.costPerVehicle,
      opp.marginPerVehicle,
      opp.totalRevenue,
      opp.totalCost,
      opp.grossMargin,
      opp.marginPct,
      opp.notes,
    ].map(csvCell),
  );

  const csv = [header.map(csvCell), ...body].map((r) => r.join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response("﻿" + csv, {
    headers: {
      // The BOM makes Excel read it as UTF-8, so ₹ and names survive.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="good-deal-${stage ?? "all"}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
