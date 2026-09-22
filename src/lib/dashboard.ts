import type { SalesStage } from "@/db/schema";
import { OPEN_STAGES } from "@/lib/constants";

/**
 * The dashboard's arithmetic, kept free of the database so it can be tested.
 *
 * Postgres does the adding up — one row per stage, and one per owner × city ×
 * vehicle type for the open pipeline — and this turns those few rows into the
 * tiles and bars. It used to be the other way round: every deal the
 * organization had ever had was sent from the database and summed in
 * JavaScript, a cost that grew with every deal and never stopped.
 */

/* ------------------------------------------------------------------ period */

export const DASHBOARD_PERIODS = [
  { value: "all", label: "All time" },
  { value: "fy", label: "This FY" },
  { value: "quarter", label: "Quarter" },
  { value: "90d", label: "90 days" },
] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number]["value"];

export function parsePeriod(value: string | undefined): DashboardPeriod {
  return DASHBOARD_PERIODS.some((p) => p.value === value)
    ? (value as DashboardPeriod)
    : "all";
}

/** India does not observe daylight saving, so the offset is fixed. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * The moment a period began, or null for all time.
 *
 * Only won and lost deals are held to it, by the day they closed: the open
 * pipeline is what is on the table today, whenever it was raised. Months are
 * counted in India — the financial year starts on 1 April and its quarters on
 * 1 April, July, October and January, all at midnight IST.
 */
export function periodStart(period: DashboardPeriod, now = new Date()): Date | null {
  if (period === "all") return null;
  if (period === "90d") return new Date(now.getTime() - 90 * 86_400_000);

  // The calendar date in India right now.
  const india = new Date(now.getTime() + IST_OFFSET_MS);
  const year = india.getUTCFullYear();
  const month = india.getUTCMonth(); // 0 = January

  let startYear = year;
  let startMonth: number;
  if (period === "fy") {
    startMonth = 3; // April
    if (month < 3) startYear -= 1;
  } else {
    startMonth = month - (month % 3);
  }
  return new Date(Date.UTC(startYear, startMonth, 1) - IST_OFFSET_MS);
}

/* ------------------------------------------------------------------- rollup */

/** One stage's totals, as the database adds them up. */
export type StageTotals = {
  stage: SalesStage;
  count: number;
  fleet: number;
  /** price × fleet, summed. */
  value: number;
  /** Recorded revenue where there is some, price × fleet where there is not. */
  wonValue: number;
  /** Recorded revenue only, so margin % is over costed deals alone. */
  revenue: number;
  margin: number;
};

/** The open pipeline, added up per owner × city × vehicle type. */
export type OpenGroup = {
  owner: string;
  city: string | null;
  vehicleType: string | null;
  fleet: number;
  value: number;
};

const NONE: Omit<StageTotals, "stage"> = {
  count: 0,
  fleet: 0,
  value: 0,
  wonValue: 0,
  revenue: 0,
  margin: 0,
};

export function summarizeDashboard(
  stages: StageTotals[],
  openGroups: OpenGroup[],
  probabilities: Record<SalesStage, number>,
) {
  const byStage = new Map(stages.map((s) => [s.stage, s]));
  const get = (stage: SalesStage) => byStage.get(stage) ?? { stage, ...NONE };

  const open = OPEN_STAGES.map(get);
  const won = get("closed_won");
  const lost = get("closed_lost");
  const sum = (rows: StageTotals[], key: keyof typeof NONE) =>
    rows.reduce((s, r) => s + r[key], 0);

  const decided = won.count + lost.count;

  const groupBy = (key: "owner" | "city" | "vehicleType") => {
    const acc = new Map<string, { name: string; value: number; fleet: number }>();
    for (const g of openGroups) {
      const name = g[key] ?? "Unassigned";
      const cur = acc.get(name) ?? { name, value: 0, fleet: 0 };
      cur.value += g.value;
      cur.fleet += g.fleet;
      acc.set(name, cur);
    }
    return [...acc.values()].sort((a, b) => b.value - a.value);
  };

  return {
    kpis: {
      pipelineValue: sum(open, "value"),
      weightedPipeline: Math.round(
        open.reduce((s, r) => s + (r.value * probabilities[r.stage]) / 100, 0),
      ),
      wonValue: won.wonValue,
      wonFleet: won.fleet,
      fleetInPipeline: sum(open, "fleet"),
      openCount: sum(open, "count"),
      wonCount: won.count,
      winRate: decided ? Math.round((won.count / decided) * 100) : null,
      grossMargin: won.margin,
      marginPct: won.revenue ? Math.round((won.margin / won.revenue) * 100) : null,
    },
    funnel: [...OPEN_STAGES, "closed_won" as SalesStage].map((stage) => {
      const s = get(stage);
      return { stage, count: s.count, value: s.value, fleet: s.fleet };
    }),
    byOwner: groupBy("owner"),
    byCity: groupBy("city"),
    byVehicleType: groupBy("vehicleType"),
  };
}
