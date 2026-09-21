import { asc, eq } from "drizzle-orm";

import { MasterDataEditor } from "@/components/admin/master-data";
import { db } from "@/db";
import { cities, lostReasons, vehicleTypes } from "@/db/schema";
import { requireAdmin } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function MasterDataPage() {
  const session = await requireAdmin();
  const org = session.organizationId;

  const [cityRows, vehicleRows, reasonRows] = await Promise.all([
    db.select().from(cities).where(eq(cities.organizationId, org)).orderBy(asc(cities.name)),
    db
      .select()
      .from(vehicleTypes)
      .where(eq(vehicleTypes.organizationId, org))
      // Admin-controlled order, which is the order Quick Add shows.
      .orderBy(asc(vehicleTypes.sortOrder), asc(vehicleTypes.name)),
    db
      .select()
      .from(lostReasons)
      .where(eq(lostReasons.organizationId, org))
      .orderBy(asc(lostReasons.label)),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="hidden text-xl font-semibold tracking-tight md:block md:text-2xl">
          Master data
        </h1>
        <p className="text-sm text-muted">
          The dropdowns the sales team picks from. Disable rather than delete —
          existing deals keep their value.
        </p>
      </div>

      <div className="space-y-4">
        <MasterDataEditor
          table="cities"
          title="Cities"
          items={cityRows.map((c) => ({ id: c.id, label: c.name, isActive: c.isActive }))}
        />
        <MasterDataEditor
          table="vehicleTypes"
          title="Vehicle types"
          orderable
          orderHint="This is the order the sales team sees when adding a deal. Put the ones you sell most at the top."
          items={vehicleRows.map((v) => ({
            id: v.id,
            label: v.name,
            isActive: v.isActive,
          }))}
        />
        <MasterDataEditor
          table="lostReasons"
          title="Closed-lost reasons"
          items={reasonRows.map((r) => ({
            id: r.id,
            label: r.label,
            isActive: r.isActive,
          }))}
        />
      </div>
    </div>
  );
}
