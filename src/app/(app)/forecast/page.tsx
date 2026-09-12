import { ForecastGrid } from "@/components/forecast/grid";
import type { SalesStage } from "@/db/schema";
import { upcomingMonths } from "@/lib/utils";
import { getForecast, getMasterData, type OpportunityFilters } from "@/server/queries";

export const dynamic = "force-dynamic";

const MONTH_COUNT = 6;

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return typeof v === "string" && v ? v : undefined;
  };

  const months = upcomingMonths(MONTH_COUNT);
  const filters: OpportunityFilters = {
    cityId: one("city"),
    vehicleTypeId: one("vehicle"),
    ownerUserId: one("spoc"),
    stage: one("stage") as SalesStage | undefined,
    from: `${months[0]}-01`,
    to: lastDayOf(months[months.length - 1]!),
  };

  const [forecast, master] = await Promise.all([
    getForecast(months, filters),
    getMasterData(),
  ]);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          Closure forecast
        </h1>
        <p className="text-sm text-muted">
          Expected vehicles by city and closing month. Tap a number to drill in.
        </p>
      </div>
      <ForecastGrid
        months={forecast.months}
        rows={forecast.rows}
        monthTotals={forecast.monthTotals}
        filters={filters}
        options={{
          cities: master.cities,
          vehicleTypes: master.vehicleTypes,
          users: master.users,
        }}
      />
    </>
  );
}

function lastDayOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}
