import "server-only";

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import {
  accounts,
  cities,
  lostReasons,
  opportunities,
  opportunityEvents,
  stageProbabilities,
  users,
  vehicleTypes,
} from "@/db/schema";
import type { SalesStage } from "@/db/schema";
import { DEFAULT_STAGE_PROBABILITY, OPEN_STAGES } from "@/lib/constants";
import { requireSession } from "@/server/auth";

export type OpportunityCard = {
  id: string;
  name: string;
  accountName: string;
  stage: SalesStage;
  city: string | null;
  cityId: string | null;
  vehicleType: string | null;
  vehicleTypeId: string | null;
  fleetSize: number;
  price: number | null;
  value: number;
  driverType: string | null;
  chargingScope: string | null;
  totalCost: number | null;
  expectedCloseDate: string | null;
  updatedAt: Date;
  ownerName: string;
  ownerId: string;
};

export type OpportunityFilters = {
  cityId?: string;
  ownerUserId?: string;
  vehicleTypeId?: string;
  stage?: SalesStage;
  from?: string;
  to?: string;
  mineOnly?: boolean;
};

function filterConditions(
  organizationId: string,
  currentUserId: string,
  f: OpportunityFilters,
) {
  const where = [eq(opportunities.organizationId, organizationId)];
  if (f.cityId) where.push(eq(opportunities.cityId, f.cityId));
  if (f.vehicleTypeId) where.push(eq(opportunities.vehicleTypeId, f.vehicleTypeId));
  if (f.stage) where.push(eq(opportunities.stage, f.stage));
  if (f.ownerUserId) where.push(eq(opportunities.ownerUserId, f.ownerUserId));
  if (f.mineOnly) where.push(eq(opportunities.ownerUserId, currentUserId));
  if (f.from) where.push(gte(opportunities.expectedCloseDate, f.from));
  if (f.to) where.push(lte(opportunities.expectedCloseDate, f.to));
  return where;
}

const cardColumns = {
  id: opportunities.id,
  name: opportunities.name,
  accountName: accounts.name,
  stage: opportunities.stage,
  city: cities.name,
  cityId: opportunities.cityId,
  vehicleType: vehicleTypes.name,
  vehicleTypeId: opportunities.vehicleTypeId,
  fleetSize: opportunities.fleetSize,
  price: opportunities.price,
  driverType: opportunities.driverType,
  chargingScope: opportunities.chargingScope,
  totalCost: opportunities.totalCost,
  expectedCloseDate: opportunities.expectedCloseDate,
  updatedAt: opportunities.updatedAt,
  ownerName: users.name,
  ownerId: opportunities.ownerUserId,
};

export async function listOpportunities(
  filters: OpportunityFilters = {},
): Promise<OpportunityCard[]> {
  const session = await requireSession();
  const rows = await db
    .select(cardColumns)
    .from(opportunities)
    .innerJoin(accounts, eq(accounts.id, opportunities.accountId))
    .innerJoin(users, eq(users.id, opportunities.ownerUserId))
    .leftJoin(cities, eq(cities.id, opportunities.cityId))
    .leftJoin(vehicleTypes, eq(vehicleTypes.id, opportunities.vehicleTypeId))
    .where(and(...filterConditions(session.organizationId, session.userId, filters)))
    .orderBy(asc(opportunities.expectedCloseDate), desc(opportunities.updatedAt));

  return rows.map((r) => ({
    ...r,
    value: (r.price ?? 0) * r.fleetSize,
  }));
}

export async function getOpportunity(id: string) {
  const session = await requireSession();
  const [row] = await db
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
        eq(opportunities.id, id),
        eq(opportunities.organizationId, session.organizationId),
      ),
    );
  if (!row) return null;

  const events = await db
    .select({
      id: opportunityEvents.id,
      kind: opportunityEvents.kind,
      fromStage: opportunityEvents.fromStage,
      toStage: opportunityEvents.toStage,
      body: opportunityEvents.body,
      createdAt: opportunityEvents.createdAt,
      userName: users.name,
    })
    .from(opportunityEvents)
    .leftJoin(users, eq(users.id, opportunityEvents.userId))
    .where(eq(opportunityEvents.opportunityId, id))
    .orderBy(desc(opportunityEvents.createdAt))
    .limit(50);

  return { ...row, events };
}

/* ------------------------------------------------------------- master data */

export const getMasterData = cache(async () => {
  const session = await requireSession();
  const org = session.organizationId;
  const [cityRows, vehicleRows, reasonRows, userRows, accountRows] =
    await Promise.all([
      db
        .select()
        .from(cities)
        .where(and(eq(cities.organizationId, org), eq(cities.isActive, true)))
        .orderBy(asc(cities.sortOrder), asc(cities.name)),
      db
        .select()
        .from(vehicleTypes)
        .where(
          and(eq(vehicleTypes.organizationId, org), eq(vehicleTypes.isActive, true)),
        )
        .orderBy(asc(vehicleTypes.sortOrder), asc(vehicleTypes.name)),
      db
        .select()
        .from(lostReasons)
        .where(
          and(eq(lostReasons.organizationId, org), eq(lostReasons.isActive, true)),
        )
        .orderBy(asc(lostReasons.sortOrder), asc(lostReasons.label)),
      db
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(and(eq(users.organizationId, org), eq(users.isActive, true)))
        .orderBy(asc(users.name)),
      db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(eq(accounts.organizationId, org))
        .orderBy(asc(accounts.name)),
    ]);

  return {
    cities: cityRows,
    vehicleTypes: vehicleRows,
    lostReasons: reasonRows,
    users: userRows,
    accounts: accountRows,
  };
});

export const getStageProbabilities = cache(async (): Promise<
  Record<SalesStage, number>
> => {
  const session = await requireSession();
  const rows = await db
    .select()
    .from(stageProbabilities)
    .where(eq(stageProbabilities.organizationId, session.organizationId));
  const map = { ...DEFAULT_STAGE_PROBABILITY };
  for (const r of rows) map[r.stage] = r.probability;
  return map;
});

/* ----------------------------------------------------------------- metrics */

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export async function getDashboard(filters: OpportunityFilters = {}) {
  const session = await requireSession();
  const [opps, probabilities] = await Promise.all([
    listOpportunitiesRaw(filters),
    getStageProbabilities(),
  ]);

  const open = opps.filter((o) => OPEN_STAGES.includes(o.stage));
  const won = opps.filter((o) => o.stage === "closed_won");
  const lost = opps.filter((o) => o.stage === "closed_lost");

  const pipelineValue = open.reduce((s, o) => s + o.value, 0);
  const weightedPipeline = open.reduce(
    (s, o) => s + (o.value * probabilities[o.stage]) / 100,
    0,
  );
  const fleetInPipeline = open.reduce((s, o) => s + o.fleetSize, 0);
  const wonValue = won.reduce((s, o) => s + (o.totalRevenue || o.value), 0);
  const wonFleet = won.reduce((s, o) => s + o.fleetSize, 0);
  const grossMargin = won.reduce((s, o) => s + (o.grossMargin ?? 0), 0);
  const wonRevenue = won.reduce((s, o) => s + (o.totalRevenue ?? 0), 0);
  const decided = won.length + lost.length;

  const funnel = OPEN_STAGES.concat(["closed_won"] as SalesStage[]).map((stage) => {
    const rows = opps.filter((o) => o.stage === stage);
    return {
      stage,
      count: rows.length,
      value: rows.reduce((s, o) => s + o.value, 0),
      fleet: rows.reduce((s, o) => s + o.fleetSize, 0),
    };
  });

  const groupBy = (key: "ownerName" | "city" | "vehicleType") => {
    const acc = new Map<string, { name: string; value: number; fleet: number }>();
    for (const o of open) {
      const name = (o[key] as string | null) ?? "Unassigned";
      const cur = acc.get(name) ?? { name, value: 0, fleet: 0 };
      cur.value += o.value;
      cur.fleet += o.fleetSize;
      acc.set(name, cur);
    }
    return [...acc.values()].sort((a, b) => b.value - a.value);
  };

  return {
    kpis: {
      pipelineValue,
      weightedPipeline: Math.round(weightedPipeline),
      wonValue,
      wonFleet,
      fleetInPipeline,
      openCount: open.length,
      wonCount: won.length,
      winRate: decided ? Math.round((won.length / decided) * 100) : null,
      grossMargin,
      marginPct: wonRevenue ? Math.round((grossMargin / wonRevenue) * 100) : null,
    },
    funnel,
    bySalesperson: groupBy("ownerName"),
    byCity: groupBy("city"),
    byVehicleType: groupBy("vehicleType"),
  };
}

type RawOpp = OpportunityCard & {
  /** Deal-level: per-vehicle revenue x fleet, computed by Postgres. */
  totalRevenue: number | null;
  grossMargin: number | null;
};

async function listOpportunitiesRaw(
  filters: OpportunityFilters,
): Promise<RawOpp[]> {
  const session = await requireSession();
  const rows = await db
    .select({
      ...cardColumns,
      totalRevenue: opportunities.totalRevenue,
      grossMargin: opportunities.grossMargin,
    })
    .from(opportunities)
    .innerJoin(accounts, eq(accounts.id, opportunities.accountId))
    .innerJoin(users, eq(users.id, opportunities.ownerUserId))
    .leftJoin(cities, eq(cities.id, opportunities.cityId))
    .leftJoin(vehicleTypes, eq(vehicleTypes.id, opportunities.vehicleTypeId))
    .where(and(...filterConditions(session.organizationId, session.userId, filters)));

  return rows.map((r) => ({ ...r, value: (r.price ?? 0) * r.fleetSize }));
}

/* ---------------------------------------------------------------- forecast */

export type ForecastCell = { fleet: number; value: number; count: number };

export async function getForecast(
  months: string[],
  filters: OpportunityFilters = {},
) {
  const session = await requireSession();
  const stages: SalesStage[] = filters.stage
    ? [filters.stage]
    : (OPEN_STAGES as SalesStage[]);

  const monthExpr = sql<string>`to_char(${opportunities.expectedCloseDate}, 'YYYY-MM')`;

  const rows = await db
    .select({
      cityId: opportunities.cityId,
      city: cities.name,
      month: monthExpr.as("month"),
      fleet: sql<number>`sum(${opportunities.fleetSize})::int`,
      value: sql<number>`sum(coalesce(${opportunities.price}, 0) * ${opportunities.fleetSize})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(opportunities)
    .leftJoin(cities, eq(cities.id, opportunities.cityId))
    .where(
      and(
        ...filterConditions(session.organizationId, session.userId, {
          ...filters,
          stage: undefined,
        }),
        inArray(opportunities.stage, stages),
        sql`${opportunities.expectedCloseDate} is not null`,
      ),
    )
    .groupBy(opportunities.cityId, cities.name, monthExpr);

  const cityOrder = new Map<string, { id: string | null; name: string }>();
  const grid = new Map<string, ForecastCell>();
  for (const r of rows) {
    const key = r.cityId ?? "none";
    cityOrder.set(key, { id: r.cityId, name: r.city ?? "No city" });
    grid.set(`${key}|${r.month}`, {
      fleet: Number(r.fleet),
      value: Number(r.value),
      count: Number(r.count),
    });
  }

  const cityRows = [...cityOrder.entries()]
    .map(([key, meta]) => {
      const cells = months.map(
        (m) => grid.get(`${key}|${m}`) ?? { fleet: 0, value: 0, count: 0 },
      );
      return {
        key,
        cityId: meta.id,
        city: meta.name,
        cells,
        total: cells.reduce(
          (acc, c) => ({
            fleet: acc.fleet + c.fleet,
            value: acc.value + c.value,
            count: acc.count + c.count,
          }),
          { fleet: 0, value: 0, count: 0 },
        ),
      };
    })
    .filter((r) => r.total.count > 0)
    .sort((a, b) => b.total.fleet - a.total.fleet);

  const monthTotals = months.map((_, i) =>
    cityRows.reduce(
      (acc, r) => ({
        fleet: acc.fleet + r.cells[i]!.fleet,
        value: acc.value + r.cells[i]!.value,
        count: acc.count + r.cells[i]!.count,
      }),
      { fleet: 0, value: 0, count: 0 },
    ),
  );

  return { months, rows: cityRows, monthTotals };
}

/** Drill-down: one city + one month, grouped by vehicle type. */
export async function getForecastDrilldown(
  cityId: string | null,
  month: string,
  filters: OpportunityFilters = {},
) {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y!, m!, 0));
  const to = end.toISOString().slice(0, 10);

  const opps = await listOpportunities({
    ...filters,
    cityId: cityId ?? undefined,
    from,
    to,
  });
  const open = opps.filter((o) =>
    filters.stage ? o.stage === filters.stage : OPEN_STAGES.includes(o.stage),
  );

  const groups = new Map<
    string,
    { vehicleType: string; fleet: number; value: number; items: OpportunityCard[] }
  >();
  for (const o of open) {
    const key = o.vehicleType ?? "Unspecified";
    const g = groups.get(key) ?? { vehicleType: key, fleet: 0, value: 0, items: [] };
    g.fleet += o.fleetSize;
    g.value += o.value;
    g.items.push(o);
    groups.set(key, g);
  }

  return [...groups.values()].sort((a, b) => b.fleet - a.fleet);
}
