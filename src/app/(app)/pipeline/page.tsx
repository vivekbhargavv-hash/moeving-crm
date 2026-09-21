import { PipelineBoard } from "@/components/pipeline/board";
import { requireSession } from "@/server/auth";
import { getMasterData, listOpportunities } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [session, opportunities, master] = await Promise.all([
    requireSession(),
    listOpportunities(),
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
        currentUserId={session.userId}
        isAdmin={session.role === "admin"}
      />
    </>
  );
}
