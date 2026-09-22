import { BarList, Funnel } from "@/components/charts/bars";
import { Card, CardHeader } from "@/components/ui-server";
import { STAGE_MAP } from "@/lib/constants";
import { parsePeriod } from "@/lib/dashboard";
import { cn, inrCompact, num } from "@/lib/utils";
import { requireSales } from "@/server/auth";
import { getDashboard, getMasterData, type OpportunityFilters } from "@/server/queries";
import { DashboardFilters } from "@/components/dashboard-filters";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return typeof v === "string" && v ? v : undefined;
  };

  const filters: OpportunityFilters = {
    cityId: one("city"),
    ownerUserId: one("spoc"),
    vehicleTypeId: one("vehicle"),
  };
  const period = parsePeriod(one("period"));

  const [, data, master] = await Promise.all([
    // Ops has no business on the dashboard; it is revenue and margin.
    requireSales(),
    getDashboard(filters, period),
    getMasterData(),
  ]);
  const { kpis } = data;

  return (
    <>
      <div className="mb-3 hidden md:block">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted">
          Open pipeline is a monthly run-rate: price per vehicle × fleet.
        </p>
      </div>

      <DashboardFilters
        filters={filters}
        period={period}
        options={{
          cities: master.cities,
          vehicleTypes: master.vehicleTypes,
          users: master.users,
        }}
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <Tile
          label="Pipeline value"
          value={inrCompact(kpis.pipelineValue)}
          sub={`${kpis.openCount} open deals`}
          wide
        />
        <Tile
          label="Weighted"
          value={inrCompact(kpis.weightedPipeline)}
          sub="By stage odds"
        />
        <Tile
          label="Fleet in pipeline"
          value={num(kpis.fleetInPipeline)}
          sub="Vehicles, open"
        />
        <Tile
          label="Closed won"
          value={inrCompact(kpis.wonValue)}
          sub={`${kpis.wonCount} deals · ${num(kpis.wonFleet)} veh`}
          tone="green"
        />
        <Tile
          label="Win rate"
          value={kpis.winRate === null ? "—" : `${kpis.winRate}%`}
          sub="Won ÷ decided"
          tone={kpis.winRate !== null && kpis.winRate < 40 ? "rose" : "plain"}
        />
        <Tile
          label="Gross margin"
          value={inrCompact(kpis.grossMargin)}
          sub={
            kpis.marginPct === null ? "On won deals" : `${kpis.marginPct}% of revenue`
          }
          tone={kpis.grossMargin < 0 ? "rose" : "green"}
          wide
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Funnel" />
          <Funnel
            data={data.funnel.map((f) => ({
              label: STAGE_MAP[f.stage].label,
              count: f.count,
              fleet: f.fleet,
              value: f.value,
            }))}
          />
        </Card>

        <Card>
          <CardHeader title="Open pipeline by deal owner" />
          <BarList
            data={data.byOwner.map((s) => ({
              label: s.name,
              value: s.value,
              secondary: `${s.fleet} veh`,
            }))}
          />
        </Card>

        <Card>
          <CardHeader title="Open pipeline by city" />
          <BarList
            data={data.byCity.map((s) => ({
              label: s.name,
              value: s.value,
              secondary: `${s.fleet} veh`,
            }))}
          />
        </Card>

        <Card>
          <CardHeader title="Fleet by vehicle type" />
          <BarList
            format="count"
            data={data.byVehicleType.map((s) => ({
              label: s.name,
              value: s.fleet,
              secondary: inrCompact(s.value),
            }))}
          />
        </Card>
      </div>
    </>
  );
}

/**
 * Three tones, not six.
 *
 * Six tinted tiles in five hues — sky, violet, slate, emerald, amber — made
 * every number shout equally, which is the same as none of them shouting.
 * Colour now marks the two that are money IN THE BANK (green) and anything
 * actually wrong (rose); everything still being chased is a plain white card,
 * and the numbers carry the hierarchy themselves.
 */
const TONES = {
  plain: "bg-white text-ink border-line",
  green: "bg-brand-soft text-brand-ink border-brand/20",
  rose: "bg-rose-50 text-rose-900 border-rose-100",
} as const;

function Tile({
  label,
  value,
  sub,
  tone = "plain",
  wide,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: keyof typeof TONES;
  /** Spans both columns on a phone, for the two numbers people look at first. */
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[104px] flex-col rounded-2xl border px-4 py-3.5",
        TONES[tone],
        wide && "col-span-2 lg:col-span-1",
      )}
    >
      <p className="truncate text-[11.5px] font-semibold uppercase tracking-wide opacity-65">
        {label}
      </p>
      <p className="tabular mt-auto pt-2 text-[26px] font-bold leading-none tracking-[-0.02em]">
        {value}
      </p>
      <p className="mt-1.5 truncate text-[12px] opacity-65">{sub}</p>
    </div>
  );
}
