import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { WebsiteLeads } from "@/components/admin/website-leads";
import { db } from "@/db";
import { leadIntakeKeys } from "@/db/schema";
import { requireAdmin } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * Where the website chatbot's leads come in: the address to give the web
 * developer, and the keys that let a chatbot post to it.
 */
export default async function WebsiteLeadsPage() {
  const session = await requireAdmin();
  const [keys, h] = await Promise.all([
    db
      .select({
        id: leadIntakeKeys.id,
        label: leadIntakeKeys.label,
        keyPrefix: leadIntakeKeys.keyPrefix,
        createdAt: leadIntakeKeys.createdAt,
        lastUsedAt: leadIntakeKeys.lastUsedAt,
        leadsReceived: leadIntakeKeys.leadsReceived,
        revokedAt: leadIntakeKeys.revokedAt,
      })
      .from(leadIntakeKeys)
      .where(eq(leadIntakeKeys.organizationId, session.organizationId))
      .orderBy(desc(leadIntakeKeys.createdAt)),
    headers(),
  ]);

  // The address as this deployment is reached, so a branch preview shows its
  // own and production shows good-deal-crm.vercel.app.
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "good-deal-crm.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const endpoint = `${proto}://${host}/api/leads/inbound`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="hidden text-xl font-semibold tracking-tight md:block md:text-2xl">
          Website leads
        </h1>
        <p className="text-sm text-muted">
          Leads from the website chatbot land on the Leads screen as New, with
          no owner and a Website tag, and every admin gets a notification to
          assign them. Make a key here and give it, with the address below, to
          whoever runs the website.
        </p>
      </div>
      <WebsiteLeads endpoint={endpoint} keys={keys} />
    </div>
  );
}
