import { LeadsBoard } from "@/components/leads/board";
import { requireLeads } from "@/server/auth";
import { getMasterData, listLeads } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  // Ops are turned away here: they put trucks on the road for deals that
  // exist, and an enquiry carries a caller's name, number and email.
  const session = await requireLeads();
  const [leads, master] = await Promise.all([listLeads(), getMasterData()]);

  const canAction = session.role === "admin" || session.role === "sales";
  const canCreate = session.role === "admin" || session.role === "noc";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 hidden md:block">
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted">
          {canAction
            ? "Inbound enquiries. Ring them back, leave a remark, and turn the good ones into deals."
            : "Inbound enquiries you have written down. A deal owner rings them back."}
        </p>
      </div>

      <LeadsBoard
        leads={leads}
        master={master}
        canAction={canAction}
        canCreate={canCreate}
      />
    </div>
  );
}
