import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";

import { db } from "@/db";
import {
  accounts,
  costDefaults,
  leads,
  cities,
  lostReasons,
  opportunities,
  opportunityEvents,
  stageProbabilities,
  users,
  vehicleTypes,
} from "@/db/schema";
import type { LeadStatus, SalesStage } from "@/db/schema";
import { DEFAULT_STAGE_PROBABILITY, OPEN_STAGES } from "@/lib/constants";
import type { CostDefault } from "@/lib/cost-defaults";
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
  /** What one truck costs to run for a month — the figure the pipeline shows. */
  costPerVehicle: number | null;
  totalCost: number | null;
  /** Deal-level, computed by Postgres: per-vehicle figure x fleet. */
  totalRevenue: number | null;
  grossMargin: number | null;
  /** Identical per vehicle and per deal — the fleet cancels out. */
  marginPct: number | null;
  /** Set when this deal grew out of an earlier one for the same customer. */
  parentOpportunityId: string | null;
  expectedCloseDate: string | null;
  /** Pencilled in at Contracting, or committed at Closed Won. */
  deploymentDate: string | null;
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
  /**
   * The Pipeline's own filters, which are multi-select.
   *
   * These used to be applied in the browser over every deal the organization
   * had ever had — 1,476 of them in a two-year book, a megabyte of HTML, on a
   * phone, to show the thirty that were yours. They are a WHERE clause now.
   */
  stages?: SalesStage[];
  cityIds?: string[];
  ownerIds?: string[];
  vehicleTypeIds?: string[];
  /**
   * Customer, deal or city, matched in SQL.
   *
   * Search has to run over the whole table rather than over whatever the page
   * happened to load, or the row cap below would quietly hide deals from the
   * one feature whose job is to find them.
   */
  search?: string;
  /** A backstop, so no single screen can ever be unbounded. */
  limit?: number;
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
  // An empty list means "all of them", so a filter only ever narrows —
  // the same rule the browser used to apply, moved to where the rows are.
  if (f.stages?.length) where.push(inArray(opportunities.stage, f.stages));
  if (f.cityIds?.length) where.push(inArray(opportunities.cityId, f.cityIds));
  if (f.ownerIds?.length) {
    where.push(inArray(opportunities.ownerUserId, f.ownerIds));
  }
  if (f.vehicleTypeIds?.length) {
    where.push(inArray(opportunities.vehicleTypeId, f.vehicleTypeIds));
  }
  const q = f.search?.trim();
  if (q) {
    // `%` and `_` are wildcards in LIKE, so a customer called "50_50" would
    // otherwise match far more than itself.
    const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        ilike(accounts.name, term),
        ilike(opportunities.name, term),
        ilike(cities.name, term),
      )!,
    );
  }
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
  costPerVehicle: opportunities.costPerVehicle,
  totalCost: opportunities.totalCost,
  totalRevenue: opportunities.totalRevenue,
  grossMargin: opportunities.grossMargin,
  marginPct: opportunities.marginPct,
  parentOpportunityId: opportunities.parentOpportunityId,
  expectedCloseDate: opportunities.expectedCloseDate,
  deploymentDate: opportunities.deploymentDate,
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
    .orderBy(asc(opportunities.expectedCloseDate), desc(opportunities.updatedAt))
    .limit(filters.limit ?? 5000);

  return rows.map(toCard);
}

/** numeric(7,2) arrives as a string; every screen wants a number. */
function toCard<T extends Omit<OpportunityCard, "value" | "marginPct"> & {
  marginPct: string | number | null;
}>(r: T) {
  return {
    ...r,
    marginPct: r.marginPct === null ? null : Number(r.marginPct),
    value: (r.price ?? 0) * r.fleetSize,
  };
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

  // The repeat-business chain, both directions: what this deal grew out of,
  // and what has grown out of it.
  const parentAlias = alias(opportunities, "parent");
  const [parent] = row.opp.parentOpportunityId
    ? await db
        .select({
          id: parentAlias.id,
          name: parentAlias.name,
          stage: parentAlias.stage,
          fleetSize: parentAlias.fleetSize,
          closedAt: parentAlias.closedAt,
        })
        .from(parentAlias)
        .where(
          and(
            eq(parentAlias.id, row.opp.parentOpportunityId),
            eq(parentAlias.organizationId, session.organizationId),
          ),
        )
    : [];

  const expansions = await db
    .select({
      id: opportunities.id,
      name: opportunities.name,
      stage: opportunities.stage,
      fleetSize: opportunities.fleetSize,
      price: opportunities.price,
      expectedCloseDate: opportunities.expectedCloseDate,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.parentOpportunityId, id),
        eq(opportunities.organizationId, session.organizationId),
      ),
    )
    .orderBy(desc(opportunities.createdAt));

  return { ...row, events, parent: parent ?? null, expansions };
}

/* ------------------------------------------------------------- master data */

export const getMasterData = cache(async () => {
  const session = await requireSession();
  const org = session.organizationId;
  const [cityRows, vehicleRows, reasonRows, userRows] = await Promise.all([
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
    ]);

  return {
    cities: cityRows,
    vehicleTypes: vehicleRows,
    lostReasons: reasonRows,
    users: userRows,
  };
});

/**
 * Everything the Add deal sheet needs, including the customer list.
 *
 * Separate from `getMasterData()` because the account list is read by exactly
 * one control — the customer datalist — and it used to be fetched, serialised
 * and shipped inside the app shell on every single page view, whether or not
 * anybody opened the sheet. It grows with the business; the pages that never
 * show it should not carry it.
 */
export type QuickAddData = Awaited<ReturnType<typeof getMasterData>> & {
  accounts: { id: string; name: string }[];
};

export const getQuickAddData = cache(async (): Promise<QuickAddData> => {
  const session = await requireSession();
  const [master, accountRows] = await Promise.all([
    getMasterData(),
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.organizationId, session.organizationId))
      .orderBy(asc(accounts.name)),
  ]);
  return { ...master, accounts: accountRows };
});

/**
 * The defaults table, whole. It is a handful of rows — one per vehicle type
 * for lease, two for the driver, a small grid for charging — so it is read in
 * one go and matched in memory rather than queried per cost line.
 */
export const getCostDefaults = cache(async (): Promise<CostDefault[]> => {
  const session = await requireSession();
  const rows = await db
    .select({
      costKey: costDefaults.costKey,
      vehicleTypeId: costDefaults.vehicleTypeId,
      chargingScope: costDefaults.chargingScope,
      operatingDays: costDefaults.operatingDays,
      amount: costDefaults.amount,
    })
    .from(costDefaults)
    .where(eq(costDefaults.organizationId, session.organizationId));
  return rows;
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
    byOwner: groupBy("ownerName"),
    byCity: groupBy("city"),
    byVehicleType: groupBy("vehicleType"),
  };
}

async function listOpportunitiesRaw(
  filters: OpportunityFilters,
): Promise<OpportunityCard[]> {
  const session = await requireSession();
  const rows = await db
    .select(cardColumns)
    .from(opportunities)
    .innerJoin(accounts, eq(accounts.id, opportunities.accountId))
    .innerJoin(users, eq(users.id, opportunities.ownerUserId))
    .leftJoin(cities, eq(cities.id, opportunities.cityId))
    .leftJoin(vehicleTypes, eq(vehicleTypes.id, opportunities.vehicleTypeId))
    .where(and(...filterConditions(session.organizationId, session.userId, filters)));

  return rows.map(toCard);
}

/* ------------------------------------------------------------- deployments */

export type Deployment = {
  id: string;
  accountName: string;
  city: string | null;
  cityId: string | null;
  vehicleType: string | null;
  vehicleTypeId: string | null;
  fleetSize: number;
  vehiclesDeployed: number;
  /** Null only for a won deal that predates the deployment date column. */
  deploymentDate: string | null;
  ownerName: string;
  isRepeat: boolean;
  /**
   * True while the deal is only at Contracting — verbally agreed, paperwork
   * in flight, and not yet won.
   *
   * Ops sees these so a hub can plan weeks ahead instead of learning about a
   * fleet the day it is sold. They are NOT a commitment: nothing is owed
   * until the deal is won, and the board marks them so nobody loads trucks
   * against a signature that has not arrived.
   */
  isExpected: boolean;
};

/**
 * The operations queue: won deals and what is still owed on them.
 *
 * Only `closed_won`, which covers repeat deployments too — an expansion is a
 * won deal, so it needs no special case here.
 *
 * Deliberately carries no money. Ops plan trucks, and the role is not allowed
 * near a margin; leaving the columns out of the query means a mistake in the
 * page cannot leak one.
 */
export async function listDeployments(): Promise<Deployment[]> {
  const session = await requireSession();
  const rows = await db
    .select({
      id: opportunities.id,
      accountName: accounts.name,
      city: cities.name,
      cityId: opportunities.cityId,
      vehicleType: vehicleTypes.name,
      vehicleTypeId: opportunities.vehicleTypeId,
      fleetSize: opportunities.fleetSize,
      vehiclesDeployed: opportunities.vehiclesDeployed,
      deploymentDate: opportunities.deploymentDate,
      ownerName: users.name,
      parentOpportunityId: opportunities.parentOpportunityId,
      stage: opportunities.stage,
    })
    .from(opportunities)
    .innerJoin(accounts, eq(accounts.id, opportunities.accountId))
    .innerJoin(users, eq(users.id, opportunities.ownerUserId))
    .leftJoin(cities, eq(cities.id, opportunities.cityId))
    .leftJoin(vehicleTypes, eq(vehicleTypes.id, opportunities.vehicleTypeId))
    .where(
      and(
        eq(opportunities.organizationId, session.organizationId),
        // Won work, plus Contracting deals that have pencilled in a date.
        // A Contracting deal with no date has nothing to tell ops, so it is
        // not here — it would be a row with an empty column where the whole
        // point is the column.
        or(
          eq(opportunities.stage, "closed_won"),
          and(
            eq(opportunities.stage, "contracting"),
            isNotNull(opportunities.deploymentDate),
          ),
        )!,
        // Everything still owed, however old, plus recently finished work so
        // "did we do that one" still has an answer. Without the second half
        // this grows forever: every deployment the company has ever made was
        // being sent to a phone, oldest first.
        or(
          sql`${opportunities.vehiclesDeployed} < ${opportunities.fleetSize}`,
          gte(
            opportunities.deploymentDate,
            sql`(current_date - interval '90 days')`,
          ),
        ),
      ),
    )
    // Soonest first; a won deal with no date yet sorts last rather than
    // pretending to be urgent.
    // Soonest first; a won deal with no date yet sorts last rather than
    // pretending to be urgent.
    .orderBy(asc(opportunities.deploymentDate), asc(accounts.name))
    // Outstanding work is unbounded only by how much is owed; finished
    // deployments are unbounded by TIME, and every one of them was being sent
    // to a phone forever. The page keeps showing recent ones so "did we do
    // that" still has an answer.
    .limit(600);

  return rows.map(({ parentOpportunityId, stage, ...r }) => ({
    ...r,
    isRepeat: parentOpportunityId !== null,
    isExpected: stage === "contracting",
  }));
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

/* -------------------------------------------------------------- won history */

export type WinCell = { deals: number; fleet: number; value: number };

/**
 * Historic wins: who closed how much, in which month.
 *
 * Keyed on closed_at — the month the deal was actually won — not the expected
 * closing date it carried while it was open, which is a forecast and often
 * wrong by the time it lands.
 */
export async function getWins(months: string[], filters: OpportunityFilters = {}) {
  const session = await requireSession();
  const monthExpr = sql<string>`to_char(${opportunities.closedAt}, 'YYYY-MM')`;

  const rows = await db
    .select({
      ownerId: opportunities.ownerUserId,
      owner: users.name,
      month: monthExpr.as("month"),
      deals: sql<number>`count(*)::int`,
      fleet: sql<number>`sum(${opportunities.fleetSize})::int`,
      value: sql<number>`sum(coalesce(${opportunities.revenue}, ${opportunities.price}, 0) * ${opportunities.fleetSize})::int`,
    })
    .from(opportunities)
    .innerJoin(users, eq(users.id, opportunities.ownerUserId))
    .where(
      and(
        ...filterConditions(session.organizationId, session.userId, {
          ...filters,
          stage: undefined,
          from: undefined,
          to: undefined,
        }),
        eq(opportunities.stage, "closed_won"),
        sql`${opportunities.closedAt} is not null`,
      ),
    )
    .groupBy(opportunities.ownerUserId, users.name, monthExpr);

  const owners = new Map<string, string>();
  const grid = new Map<string, WinCell>();
  for (const r of rows) {
    owners.set(r.ownerId, r.owner);
    grid.set(`${r.ownerId}|${r.month}`, {
      deals: Number(r.deals),
      fleet: Number(r.fleet),
      value: Number(r.value),
    });
  }

  const ownerRows = [...owners.entries()]
    .map(([ownerId, owner]) => {
      const cells = months.map(
        (m) => grid.get(`${ownerId}|${m}`) ?? { deals: 0, fleet: 0, value: 0 },
      );
      return {
        key: ownerId,
        ownerId,
        owner,
        cells,
        total: cells.reduce(
          (a, c) => ({
            deals: a.deals + c.deals,
            fleet: a.fleet + c.fleet,
            value: a.value + c.value,
          }),
          { deals: 0, fleet: 0, value: 0 },
        ),
      };
    })
    .filter((r) => r.total.deals > 0)
    .sort((a, b) => b.total.deals - a.total.deals);

  const monthTotals = months.map((_, i) =>
    ownerRows.reduce(
      (a, r) => ({
        deals: a.deals + r.cells[i]!.deals,
        fleet: a.fleet + r.cells[i]!.fleet,
        value: a.value + r.cells[i]!.value,
      }),
      { deals: 0, fleet: 0, value: 0 },
    ),
  );

  return { months, rows: ownerRows, monthTotals };
}

/** The accounts one owner closed in one month. */
export async function getWinsDrilldown(ownerId: string, month: string) {
  const session = await requireSession();
  const rows = await db
    .select({
      id: opportunities.id,
      name: opportunities.name,
      accountName: accounts.name,
      city: cities.name,
      vehicleType: vehicleTypes.name,
      fleetSize: opportunities.fleetSize,
      revenue: opportunities.totalRevenue,
      margin: opportunities.grossMargin,
      closedAt: opportunities.closedAt,
    })
    .from(opportunities)
    .innerJoin(accounts, eq(accounts.id, opportunities.accountId))
    .leftJoin(cities, eq(cities.id, opportunities.cityId))
    .leftJoin(vehicleTypes, eq(vehicleTypes.id, opportunities.vehicleTypeId))
    .where(
      and(
        eq(opportunities.organizationId, session.organizationId),
        eq(opportunities.ownerUserId, ownerId),
        eq(opportunities.stage, "closed_won"),
        sql`to_char(${opportunities.closedAt}, 'YYYY-MM') = ${month}`,
      ),
    )
    .orderBy(desc(opportunities.closedAt));
  return rows;
}

/* -------------------------------------------------------------------- leads */

export type LeadRow = {
  id: string;
  enquiryDate: string;
  companyName: string;
  typeOfGoods: string | null;
  vehicleRequirement: number | null;
  callingCity: string | null;
  vehicleType: string | null;
  callerName: string | null;
  designation: string | null;
  mobile: string | null;
  email: string | null;
  foundOn: string | null;
  status: LeadStatus;
  remarks: string | null;
  notQualifiedReason: string | null;
  opportunityId: string | null;
  actionedBy: string | null;
  actionedAt: Date | null;
  createdBy: string | null;
  /** When the enquiry was written down — not the day it came in. */
  createdAt: Date;
  /** When it became a deal. */
  convertedAt: Date | null;
  /**
   * The stage of the deal it became. This is what turns "converted" into
   * "won": a conversion rate that stops at the deal being raised says nothing
   * about whether the inbound is any good.
   */
  dealStage: SalesStage | null;
};

/**
 * Every enquiry, newest first, with the names of the people either side of it.
 *
 * Unfiltered on purpose: the desk is small and a lead nobody has picked up is
 * exactly what this screen exists to show. Narrowing happens in the browser,
 * over a list that is counted in hundreds rather than thousands.
 */
export async function listLeads(): Promise<LeadRow[]> {
  const session = await requireSession();
  const actioner = alias(users, "actioner");
  const creator = alias(users, "creator");

  return db
    .select({
      id: leads.id,
      enquiryDate: leads.enquiryDate,
      companyName: leads.companyName,
      typeOfGoods: leads.typeOfGoods,
      vehicleRequirement: leads.vehicleRequirement,
      callingCity: leads.callingCity,
      vehicleType: leads.vehicleType,
      callerName: leads.callerName,
      designation: leads.designation,
      mobile: leads.mobile,
      email: leads.email,
      foundOn: leads.foundOn,
      status: leads.status,
      remarks: leads.remarks,
      notQualifiedReason: leads.notQualifiedReason,
      opportunityId: leads.opportunityId,
      actionedBy: actioner.name,
      actionedAt: leads.actionedAt,
      createdBy: creator.name,
      createdAt: leads.createdAt,
      convertedAt: leads.convertedAt,
      dealStage: opportunities.stage,
    })
    .from(leads)
    .leftJoin(actioner, eq(actioner.id, leads.actionedByUserId))
    .leftJoin(creator, eq(creator.id, leads.createdByUserId))
    // Left, not inner: most leads never became a deal, and those are the rows
    // the funnel is mostly about.
    .leftJoin(opportunities, eq(opportunities.id, leads.opportunityId))
    .where(eq(leads.organizationId, session.organizationId))
    .orderBy(desc(leads.enquiryDate), desc(leads.createdAt));
}
