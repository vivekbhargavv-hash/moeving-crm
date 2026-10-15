import { csvResponse, listParam } from "@/lib/csv";
import { todayInIndia } from "@/lib/utils";
import { requireSession } from "@/server/auth";
import { listDeployments } from "@/server/queries";

export const dynamic = "force-dynamic";

/**
 * The Deployments queue as a spreadsheet — exactly the rows the screen holds
 * (everything still owed, plus 90 days of finished work), narrowed by the
 * city and vehicle filters applied on screen (`?city=&vehicle=`).
 *
 * Ops may download it: like the screen, it carries no money column, because
 * `listDeployments()` selects none.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (session.role === "noc") {
    return new Response("Not available for this role", { status: 403 });
  }
  const url = new URL(request.url);
  const cityIds = listParam(url, "city");
  const vehicleIds = listParam(url, "vehicle");
  const has = (group: string[], v: string | null) =>
    group.length === 0 || (v !== null && group.includes(v));

  const today = todayInIndia();
  const deployments = (await listDeployments()).filter(
    (d) => has(cityIds, d.cityId) && has(vehicleIds, d.vehicleTypeId),
  );

  const header = [
    "Status",
    "Deployment date",
    "Customer",
    "City",
    "Vehicle type",
    "Vehicles",
    "Deployed",
    "Still to deploy",
    "Repeat order",
    "Deal Owner",
  ];

  const rows = deployments.map((d) => {
    const remaining = Math.max(d.fleetSize - d.vehiclesDeployed, 0);
    const status =
      remaining === 0
        ? "Deployed"
        : d.isExpected
          ? "Expected (Contracting)"
          : d.deploymentDate && d.deploymentDate < today
            ? "Overdue"
            : "To deploy";
    return [
      status,
      d.deploymentDate ?? "",
      d.accountName,
      d.city ?? "",
      d.vehicleType ?? "",
      d.fleetSize,
      d.vehiclesDeployed,
      remaining,
      d.isRepeat ? "Yes" : "No",
      d.ownerName,
    ];
  });

  return csvResponse("deployments", header, rows);
}
