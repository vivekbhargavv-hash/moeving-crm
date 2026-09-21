import { PipelineBoard } from "@/components/pipeline/board";
import type { Filters } from "@/components/pipeline/filters";
import type { SalesStage } from "@/db/schema";
import { requireSales } from "@/server/auth";
import { getMasterData, listOpportunities } from "@/server/queries";

export const dynamic = "force-dynamic";

/** One `?k=a,b` parameter to a list, ignoring the empty string. */
function list(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw.split(",").filter(Boolean);
}

/**
 * The pipeline, narrowed before it leaves the database.
 *
 * The filters live in the URL rather than in component state, for one
 * measured reason: this page used to select every deal the organization had
 * ever had and let the browser hide the ones you had filtered out. At 1,476
 * deals that was a megabyte of HTML on a phone to show the thirty that were
 * yours. In the URL, the same filters are a WHERE clause — and they survive a
 * reload and can be shared.
 */
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const session = await requireSales();

  // Everyone opens on their own deals, admins included. `scope=all` is the
  // visible toggle; `owner` is the filter sheet picking specific people.
  const search = typeof sp.q === "string" ? sp.q : "";
  const owners = list(sp.owner);
  const mine = sp.scope !== "all" && owners.length === 0;

  const filters: Filters = {
    stages: list(sp.stage) as SalesStage[],
    cityIds: list(sp.city),
    ownerIds: owners,
    vehicleTypeIds: list(sp.vehicle),
  };

  const [opportunities, master] = await Promise.all([
    listOpportunities({
      ...filters,
      search,
      ownerIds: mine ? [session.userId] : filters.ownerIds,
      // A backstop. It is safe to keep low because search runs in SQL: a deal
      // past the cap is still one search away, not hidden.
      limit: 250,
    }),
    getMasterData(),
  ]);

  return (
    <>
      <div className="mb-4 hidden md:block">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted">
          Drag a card to move it, or use the stage button.
        </p>
      </div>
      <PipelineBoard
        opportunities={opportunities}
        lostReasons={master.lostReasons}
        owners={master.users}
        cities={master.cities}
        vehicleTypes={master.vehicleTypes}
        currentUserId={session.userId}
        filters={filters}
        search={search}
        showingMine={mine}
        capped={opportunities.length >= 250}
      />
    </>
  );
}
