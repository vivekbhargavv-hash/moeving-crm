import { STAGE_MAP } from "@/lib/constants";
import { csvResponse } from "@/lib/csv";
import { dealId, leadId } from "@/lib/record-ids";
import { formatDateTimeInIndia } from "@/lib/utils";
import { requireSession } from "@/server/auth";
import { listLeads } from "@/server/queries";

export const dynamic = "force-dynamic";

const STATUS = {
  new: "New",
  qualified: "Qualified",
  not_qualified: "Not qualified",
  converted: "Converted",
} as const;

const when = (d: Date | null) => (d ? formatDateTimeInIndia(d) : "");

/**
 * Every lead as a spreadsheet, newest enquiry first: Lead ID, the Deal ID it
 * became, and that deal's stage, so a lead joins to the Pipeline, Forecast,
 * Deployments and deployment-log exports on Deal ID.
 *
 * Admin and deal owners only. NOC works leads but is kept from what became of
 * them (deal stages are pipeline information), and ops sees no leads at all.
 */
export async function GET() {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "sales") {
    return new Response("Not available for this role", { status: 403 });
  }
  const leads = await listLeads();

  const header = [
    "Lead ID",
    "Deal ID",
    "Deal stage",
    "Status",
    "Enquiry date",
    "Company",
    "Type of goods",
    "Vehicles asked for",
    "Calling city",
    "Vehicle type",
    "Caller",
    "Designation",
    "Mobile",
    "Email",
    "Found us on",
    "Assigned to",
    "Assigned at",
    "Actioned by",
    "Actioned at",
    "Not qualified reason",
    "Remarks",
    "Converted at",
    "Written down by",
    "Written down at",
  ];

  const rows = leads.map((l) => [
    leadId(l.ref),
    dealId(l.dealRef),
    l.dealStage ? STAGE_MAP[l.dealStage].label : "",
    STATUS[l.status],
    l.enquiryDate,
    l.companyName,
    l.typeOfGoods,
    l.vehicleRequirement,
    l.callingCity,
    l.vehicleType,
    l.callerName,
    l.designation,
    l.mobile,
    l.email,
    l.foundOn,
    l.assignedTo,
    when(l.assignedAt),
    l.actionedBy,
    when(l.actionedAt),
    l.notQualifiedReason,
    l.remarks,
    when(l.convertedAt),
    l.createdBy,
    when(l.createdAt),
  ]);

  return csvResponse("leads", header, rows);
}
