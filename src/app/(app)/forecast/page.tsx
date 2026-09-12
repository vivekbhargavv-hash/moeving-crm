import { ForecastGrid } from "@/components/forecast/grid";
import { ForecastTabs } from "@/components/forecast/tabs";
import { WinsGrid } from "@/components/forecast/wins";
import type { SalesStage } from "@/db/schema";
import { pastMonths, upcomingMonths } from "@/lib/utils";
import {
  getForecast,
  getMasterData,
  getWins,
  type OpportunityFilters,
} from "@/server/queries";

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

  const tab = one("tab") === "wins" ? "wins" : "forecast";
  const winMonths = pastMonths(6);

  const [forecast, wins, master] = await Promise.all([
    getForecast(months, filters),
    // Both are cheap grouped queries; fetching them together keeps switching
    // tabs instant instead of a round trip to Singapore each time.
    getWins(winMonths, { ownerUserId: filters.ownerUserId }),
    getMasterData(),
  ]);

  return (
    <>
      <h1 className="mb-3 hidden text-2xl font-semibold tracking-tight md:block">
        {tab === "wins" ? "Wins" : "Closure forecast"}
      </h1>

      <ForecastTabs active={tab} />

      <p className="mb-3 text-[13px] text-muted md:text-sm">
        {tab === "wins"
          ? "Accounts closed won, by owner and month. Tap a number for the accounts."
          : "Expected vehicles by city and closing month. Tap a city for its clients, or a number to drill in."}
      </p>

      {tab === "wins" ? (
        <WinsGrid
          months={wins.months}
          rows={wins.rows}
          monthTotals={wins.monthTotals}
        />
      ) : (
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
      )}
    </>
  );
}

function lastDayOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}
