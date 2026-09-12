import { BarList, Funnel } from "@/components/charts/bars";
import { Card, CardHeader } from "@/components/ui-server";
import { STAGE_MAP } from "@/lib/constants";
import { cn, inrCompact, num } from "@/lib/utils";
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

  const [data, master] = await Promise.all([getDashboard(filters), getMasterData()]);
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
          tone="blue"
          wide
        />
        <Tile
          label="Weighted"
          value={inrCompact(kpis.weightedPipeline)}
          sub="By stage odds"
          tone="violet"
        />
        <Tile
          label="Fleet in pipeline"
          value={num(kpis.fleetInPipeline)}
          sub="Vehicles, open"
          tone="slate"
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
          tone="amber"
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

const TONES = {
  blue: "bg-sky-50 text-sky-900 border-sky-100",
  violet: "bg-violet-50 text-violet-900 border-violet-100",
  green: "bg-emerald-50 text-emerald-900 border-emerald-100",
  amber: "bg-amber-50 text-amber-900 border-amber-100",
  rose: "bg-rose-50 text-rose-900 border-rose-100",
  slate: "bg-slate-50 text-slate-900 border-slate-200",
} as const;

function Tile({
  label,
  value,
  sub,
  tone = "slate",
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
        "rounded-2xl border px-4 py-3.5",
        TONES[tone],
        wide && "col-span-2 lg:col-span-1",
      )}
    >
      <p className="text-[12px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="tabular mt-1 text-[26px] font-bold leading-none tracking-[-0.02em]">
        {value}
      </p>
      <p className="mt-1.5 truncate text-[12px] opacity-70">{sub}</p>
    </div>
  );
}
