import { asc, eq } from "drizzle-orm";

import { CostDefaultsEditor } from "@/components/admin/cost-defaults";
import { db } from "@/db";
import { costDefaults, vehicleTypes } from "@/db/schema";
import { requireAdmin } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function CostDefaultsPage() {
  const session = await requireAdmin();
  const org = session.organizationId;

  const [vehicleRows, defaultRows] = await Promise.all([
    db
      .select({ id: vehicleTypes.id, name: vehicleTypes.name })
      .from(vehicleTypes)
      .where(eq(vehicleTypes.organizationId, org))
      .orderBy(asc(vehicleTypes.sortOrder), asc(vehicleTypes.name)),
    db
      .select({
        costKey: costDefaults.costKey,
        vehicleTypeId: costDefaults.vehicleTypeId,
        chargingScope: costDefaults.chargingScope,
        operatingDays: costDefaults.operatingDays,
        amount: costDefaults.amount,
      })
      .from(costDefaults)
      .where(eq(costDefaults.organizationId, org)),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="hidden text-xl font-semibold tracking-tight md:block md:text-2xl">
          Unit economics defaults
        </h1>
        <p className="text-sm text-muted">
          What each cost line starts at when somebody costs a deal. They are a
          starting point, not a rule: whoever closes the deal can change any
          figure, and nothing already saved is ever rewritten from here.
        </p>
      </div>

      <CostDefaultsEditor vehicleTypes={vehicleRows} rows={defaultRows} />
    </div>
  );
}
