import { CustomerList } from "@/components/customers/list";
import { renewalsDue } from "@/lib/agreements";
import { todayInIndia } from "@/lib/utils";
import { requireSales } from "@/server/auth";
import { listAgreements, listCustomers } from "@/server/queries";

export const dynamic = "force-dynamic";

/**
 * Every customer we have done or are doing business with: their deals, the
 * vehicles on the road, and the signed agreements behind them.
 *
 * Commercial — it carries what customers pay — so it is refused to ops and
 * NOC like the Pipeline is.
 */
export default async function CustomersPage() {
  const [session, customers, papers] = await Promise.all([
    requireSales(),
    listCustomers(),
    listAgreements(),
  ]);
  const today = todayInIndia();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 hidden text-2xl font-semibold tracking-tight md:block">
        Customers
      </h1>
      <p className="mb-3 text-[13px] text-muted md:text-sm">
        Every customer, their deals and their signed agreements.
      </p>
      <CustomerList
        customers={customers}
        renewals={renewalsDue(papers, today).map((a) => ({
          id: a.id,
          accountId: a.accountId,
          accountName: a.accountName,
          type: a.type,
          dealName: a.dealName,
          renewalOn: a.renewalOn,
        }))}
        today={today}
        isAdmin={session.role === "admin"}
      />
    </div>
  );
}
