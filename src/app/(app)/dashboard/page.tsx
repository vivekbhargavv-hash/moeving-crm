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
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Dashboard</h1>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          label="Pipeline value"
          value={inrCompact(kpis.pipelineValue)}
          sub={`${kpis.openCount} open deals`}
        />
        <Tile
          label="Weighted pipeline"
          value={inrCompact(kpis.weightedPipeline)}
          sub="By stage probability"
        />
        <Tile
          label="Closed won"
          value={inrCompact(kpis.wonValue)}
          sub={`${kpis.wonCount} deals · ${num(kpis.wonFleet)} vehicles`}
          tone="good"
        />
        <Tile
          label="Fleet in pipeline"
          value={num(kpis.fleetInPipeline)}
          sub="Vehicles, open stages"
        />
        <Tile
          label="Win rate"
          value={kpis.winRate === null ? "—" : `${kpis.winRate}%`}
          sub="Won ÷ (won + lost)"
        />
        <Tile
          label="Gross margin"
          value={inrCompact(kpis.grossMargin)}
          sub={kpis.marginPct === null ? "On won deals" : `${kpis.marginPct}% of revenue`}
          tone={kpis.grossMargin < 0 ? "bad" : "good"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
          <CardHeader title="Open pipeline by salesperson" />
          <BarList
            data={data.bySalesperson.map((s) => ({
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

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad";
}) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-1 text-[22px] font-semibold leading-tight tracking-tight md:text-[26px]",
          tone === "good" && "text-emerald-700",
          tone === "bad" && "text-rose-700",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[12px] text-muted">{sub}</p>
    </Card>
  );
}
