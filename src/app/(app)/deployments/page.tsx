import { DeploymentsBoard } from "@/components/deployments/board";
import { requireDeployments } from "@/server/auth";
import { getMasterData, listDeployments } from "@/server/queries";

export const dynamic = "force-dynamic";

/**
 * The operations queue.
 *
 * Open to ops, sales and admin — this is the one page the ops role can reach,
 * and sales seeing it is useful: it is what they promised the customer. The
 * NOC desk is not here; they take enquiries, and a deployment is a promise
 * made long after the call they took.
 */
export default async function DeploymentsPage() {
  const [session, deployments, master] = await Promise.all([
    requireDeployments(),
    listDeployments(),
    getMasterData(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="hidden text-2xl font-semibold tracking-tight md:block">
          Deployments
        </h1>
        {/* On every width: ops needs to know why a deal not yet won is here. */}
        <p className="text-[13px] text-muted md:text-sm">
          All deals in Contracting or Closed Won with an expected deployment
          date show here, for ops to plan deployments.
        </p>
      </div>
      <DeploymentsBoard
        deployments={deployments}
        cities={master.cities}
        vehicleTypes={master.vehicleTypes}
        // A deal page carries the cost sheet, so ops does not get a link to one.
        canOpenDeals={session.role !== "ops"}
      />
    </div>
  );
}
