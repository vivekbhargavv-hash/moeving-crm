import { DeploymentsBoard } from "@/components/deployments/board";
import { requireSession } from "@/server/auth";
import { getMasterData, listDeployments } from "@/server/queries";

export const dynamic = "force-dynamic";

/**
 * The operations queue.
 *
 * Open to everyone signed in — this is the one page the ops role can reach,
 * and sales seeing it is useful: it is what they promised the customer.
 */
export default async function DeploymentsPage() {
  const [session, deployments, master] = await Promise.all([
    requireSession(),
    listDeployments(),
    getMasterData(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 hidden md:block">
        <h1 className="text-2xl font-semibold tracking-tight">Deployments</h1>
        <p className="text-sm text-muted">
          Vehicles owed to customers on won deals, soonest first.
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
