import { AlertTriangle, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { AgreementsPanel } from "@/components/customers/agreements";
import { Badge, Card, CardHeader } from "@/components/ui-server";
import { agreementFolder, isCovered } from "@/lib/agreements";
import { STAGE_MAP } from "@/lib/constants";
import { cn, formatDate, inrCompact, num, todayInIndia } from "@/lib/utils";
import { requireSales } from "@/server/auth";
import { getCustomer, type OpportunityCard } from "@/server/queries";

export const dynamic = "force-dynamic";

/**
 * Everything we have done with one customer: its deals (expansions under the
 * deal they grew out of), its signed agreements, and the people we have
 * spoken to there.
 */
export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, customer] = await Promise.all([requireSales(), getCustomer(id)]);
  if (!customer) notFound();

  const { account, deals, agreements, contacts } = customer;
  const won = deals.filter((d) => d.stage === "closed_won");
  const open = deals.filter((d) => STAGE_MAP[d.stage].open);
  const closed = deals.filter((d) => d.stage === "closed_lost" || d.stage === "dormant");
  const uncovered = won.filter((d) => !isCovered(d, agreements));

  const onRoad = won.reduce((s, d) => s + Math.min(d.fleetSize, d.vehiclesDeployed), 0);
  const wonVehicles = won.reduce((s, d) => s + d.fleetSize, 0);
  const monthly = won.reduce((s, d) => s + d.value, 0);
  const pipeline = open.reduce((s, d) => s + d.value, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink fallbackHref="/customers" fallbackLabel="Customers" />

      <div className="mb-3 rounded-2xl border border-line bg-white p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Customer</p>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.02em]">{account.name}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="On the road" value={wonVehicles ? `${num(onRoad)} / ${num(wonVehicles)}` : "—"} />
          <Stat label="Won / month" value={monthly ? inrCompact(monthly) : "—"} tone={monthly ? "good" : undefined} />
          <Stat label="Pipeline / month" value={pipeline ? inrCompact(pipeline) : "—"} />
          <Stat label="Deals" value={num(deals.length)} />
        </dl>
      </div>

      {uncovered.length ? (
        <div
          role="status"
          className="mb-3 flex gap-2.5 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <strong>No agreement</strong> for {uncovered.length === 1 ? "a won deal" : `${uncovered.length} won deals`}:{" "}
            {uncovered.map((d) => d.name).join(", ")}. Upload the signed agreement
            below — one for the whole customer covers every deal.
          </p>
        </div>
      ) : null}

      <AgreementsPanel
        accountId={account.id}
        accountName={account.name}
        folder={agreementFolder(session.organizationId, account.id)}
        agreements={agreements}
        deals={deals.map((d) => ({ id: d.id, name: d.name, stage: d.stage }))}
        today={todayInIndia()}
      />

      <Card className="mt-3">
        <CardHeader title="Deals" />
        {deals.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">No deals yet.</p>
        ) : (
          <div className="space-y-3 px-4 pb-4">
            <DealGroup title="Won" deals={won} all={deals} uncovered={uncovered} />
            <DealGroup title="Open" deals={open} all={deals} uncovered={[]} />
            <DealGroup title="Lost and dormant" deals={closed} all={deals} uncovered={[]} />
          </div>
        )}
      </Card>

      {contacts.length ? (
        <Card className="mt-3">
          <CardHeader title="People we have spoken to" />
          <ul className="divide-y divide-line px-4 pb-2">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {c.callerName || "Unnamed caller"}
                    {c.designation ? (
                      <span className="font-normal text-muted"> · {c.designation}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-[12.5px] text-muted">
                    Enquired {formatDate(c.enquiryDate)}
                    {c.email ? ` · ${c.email}` : ""}
                  </p>
                </div>
                {c.email ? (
                  <a
                    href={`mailto:${c.email}`}
                    aria-label={`Email ${c.callerName ?? "contact"}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-muted active:bg-canvas"
                  >
                    <Mail size={17} />
                  </a>
                ) : null}
                {c.mobile ? (
                  <a
                    href={`tel:${c.mobile}`}
                    aria-label={`Call ${c.callerName ?? "contact"}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-brand-ink active:bg-canvas"
                  >
                    <Phone size={17} />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="px-4 pb-4 text-[12px] text-muted">
            From the enquiries that became this customer&apos;s deals.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2">
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd
        className={cn(
          "tabular mt-0.5 text-[17px] font-bold",
          tone === "good" && "text-emerald-700",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * One group of deals, each expansion tucked under the deal it grew out of —
 * when that parent is in the same group; otherwise it stands on its own.
 */
function DealGroup({
  title,
  deals,
  all,
  uncovered,
}: {
  title: string;
  deals: OpportunityCard[];
  all: OpportunityCard[];
  uncovered: OpportunityCard[];
}) {
  if (deals.length === 0) return null;
  const ids = new Set(deals.map((d) => d.id));
  const tops = deals
    .filter((d) => !d.parentOpportunityId || !ids.has(d.parentOpportunityId))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const childrenOf = (id: string) => all.filter((d) => d.parentOpportunityId === id && ids.has(d.id));
  const missing = new Set(uncovered.map((d) => d.id));

  return (
    <div>
      <div className="flex items-baseline gap-2 border-b border-line pb-1">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</p>
        <p className="tabular ml-auto text-[12px] text-muted">
          {num(deals.length)} · {num(deals.reduce((s, d) => s + d.fleetSize, 0))} veh
        </p>
      </div>
      <ul className="divide-y divide-line">
        {tops.map((d) => (
          <li key={d.id}>
            <DealLine d={d} missing={missing.has(d.id)} />
            {childrenOf(d.id).map((x) => (
              <div key={x.id} className="border-l-2 border-line pl-3">
                <DealLine d={x} missing={missing.has(x.id)} expansion />
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DealLine({
  d,
  missing,
  expansion,
}: {
  d: OpportunityCard;
  missing: boolean;
  expansion?: boolean;
}) {
  const stage = STAGE_MAP[d.stage];
  return (
    <Link href={`/opportunities/${d.id}`} className="block py-2.5 active:opacity-70">
      <div className="flex items-center gap-2">
        <Badge className={cn("shrink-0", stage.chip)}>{stage.short}</Badge>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
          {expansion ? <span className="text-muted">+ </span> : null}
          {d.name}
        </span>
        <span className="tabular shrink-0 text-[13px] font-semibold">
          {d.value ? inrCompact(d.value) : "—"}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted">
        <span className="min-w-0 flex-1 truncate">
          {d.city ?? "No city"} · {d.fleetSize} × {d.vehicleType ?? "—"} · {d.ownerName.split(" ")[0]}
        </span>
        {missing ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            <AlertTriangle size={11} aria-hidden="true" />
            No agreement
          </span>
        ) : null}
      </div>
    </Link>
  );
}
