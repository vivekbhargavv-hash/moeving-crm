import { csvResponse, listParam } from "@/lib/csv";
import { DROP_REASON_LABEL } from "@/lib/deployment-progress";
import { dealId, deploymentId, leadId } from "@/lib/record-ids";
import { formatDateTimeInIndia } from "@/lib/utils";
import { requireSession } from "@/server/auth";
import { listDeploymentLog } from "@/server/queries";

export const dynamic = "force-dynamic";

/**
 * The deployment log as a spreadsheet: one row per Deployment ID — vehicles
 * put on the road or dropped, when, why and by whom — each carrying its Deal
 * ID and Lead ID so it joins to the other exports.
 *
 * `Vehicles` is the change, so summing it per Deal ID by Event gives the
 * deal's deployed and dropped totals. Same audience as the Deployments
 * export: no money, so ops may download it; NOC may not.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (session.role === "noc") {
    return new Response("Not available for this role", { status: 403 });
  }
  const url = new URL(request.url);
  const rows = await listDeploymentLog({
    cityIds: listParam(url, "city"),
    vehicleTypeIds: listParam(url, "vehicle"),
  });

  const header = [
    "Deployment ID",
    "Deal ID",
    "Lead ID",
    "Parent Deal ID",
    "Event",
    "Vehicles",
    "Date",
    "Reason",
    "Note",
    "Customer",
    "Deal",
    "City",
    "Vehicle type",
    "Vehicles sold on the deal",
    "Recorded by",
    "Recorded at",
  ];

  const body = rows.map((r) => [
    deploymentId(r.ref),
    dealId(r.dealRef),
    leadId(r.leadRef),
    dealId(r.parentRef),
    r.kind === "deployed"
      ? r.vehicles > 0
        ? "Deployed"
        : "Deployed (correction)"
      : r.vehicles > 0
        ? "Dropped"
        : "Dropped (restored)",
    r.vehicles,
    r.happenedOn ?? "",
    r.reason ? DROP_REASON_LABEL[r.reason] : "",
    r.note ?? "",
    r.accountName,
    r.dealName,
    r.city ?? "",
    r.vehicleType ?? "",
    r.fleetSize,
    r.recordedBy ?? "",
    formatDateTimeInIndia(r.createdAt),
  ]);

  return csvResponse("deployment-log", header, body);
}
