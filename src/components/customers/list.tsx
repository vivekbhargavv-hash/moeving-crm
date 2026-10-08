"use client";

import { AlertTriangle, CalendarClock, ChevronRight, FileText, Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Input, Segmented } from "@/components/ui";
import type { AgreementType } from "@/db/schema";
import { AGREEMENT_TYPE_LABEL, daysUntil } from "@/lib/agreements";
import { cn, formatDate, inrCompact, num } from "@/lib/utils";
import type { CustomerRow } from "@/server/queries";

import { DeleteCustomer } from "./delete-customer";

type Renewal = {
  id: string;
  accountId: string;
  accountName: string;
  type: AgreementType;
  dealName: string | null;
  renewalOn: string;
};

/** "empty" — customers with no deals — is reached from the admin's note, not the switch. */
type View = "all" | "won" | "missing" | "empty";

const PAGE = 60;

/**
 * The customer book: renewals that need somebody first, then every customer,
 * searchable, with the ones whose won deals have no signed agreement easy to
 * pull out.
 */
export function CustomerList({
  customers,
  renewals,
  today,
  isAdmin,
}: {
  customers: CustomerRow[];
  renewals: Renewal[];
  today: string;
  /** Admins may delete a customer with no deals, from its row. */
  isAdmin: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<View>("all");
  const [shown, setShown] = React.useState(PAGE);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter(
      (c) =>
        (!q || c.name.toLowerCase().includes(q)) &&
        (view === "all" ||
          (view === "won" && c.wonDeals > 0) ||
          (view === "missing" && c.uncovered > 0) ||
          (view === "empty" && c.deals === 0)),
    );
  }, [customers, query, view]);

  React.useEffect(() => setShown(PAGE), [query, view]);

  const emptyCount = customers.filter((c) => c.deals === 0).length;

  return (
    <div>
      {renewals.length ? <Renewals renewals={renewals} today={today} /> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers"
            aria-label="Search customers"
            className="h-12 pl-9"
          />
        </div>
        <Segmented
          label="Which customers"
          className="basis-full sm:w-[330px] sm:flex-none sm:basis-auto"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "All" },
            { value: "won", label: "Won" },
            // No count here: at a third of a 390px screen "No agreement (3)"
            // truncates, and each row already carries the badge.
            { value: "missing", label: "No agreement" },
          ]}
        />
      </div>

      {/* Admin housekeeping: customers nothing hangs off, which may be
          deleted. A note rather than a fourth option on the switch, which
          would truncate on a phone and means nothing to a deal owner. */}
      {isAdmin && (emptyCount > 0 || view === "empty") ? (
        <button
          type="button"
          onClick={() => setView(view === "empty" ? "all" : "empty")}
          className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-line bg-white/60 px-4 text-left text-[13px] text-muted active:bg-canvas"
        >
          <span className="flex-1">
            {view === "empty"
              ? "Showing customers with no deals. Delete any that are not needed."
              : `${num(emptyCount)} ${emptyCount === 1 ? "customer has" : "customers have"} no deals and can be deleted.`}
          </span>
          <span className="shrink-0 font-semibold text-brand-ink">
            {view === "empty" ? "Show all" : "Review"}
          </span>
        </button>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
          <p className="font-semibold">
            {view === "missing" && !query
              ? "Every won deal has an agreement"
              : view === "empty" && !query
                ? "Every customer has a deal"
                : "No customers match"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {view === "missing" && !query
              ? "Nothing is waiting on paperwork."
              : "Try part of the name, or switch to All."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-white">
          {filtered.slice(0, shown).map((c) => (
            <li key={c.id}>
              <CustomerItem
                c={c}
                // Agreements are deleted one by one on purpose; the server
                // would refuse, so the bin is not offered.
                canDelete={isAdmin && c.deals === 0 && c.agreements === 0}
              />
            </li>
          ))}
        </ul>
      )}

      {filtered.length > shown ? (
        <button
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-3 h-12 w-full rounded-2xl border border-line bg-white text-[14px] font-semibold text-brand-ink active:bg-canvas"
        >
          Show more
          <span className="ml-1 font-normal text-muted">
            ({filtered.length - shown} more)
          </span>
        </button>
      ) : null}

      <p className="mt-3 px-1 text-xs text-muted">
        {num(customers.length)} customers. Revenue is won deals&apos; monthly rent
        (price × fleet); pipeline is open deals&apos; monthly value, unweighted.
      </p>
    </div>
  );
}

function CustomerItem({ c, canDelete }: { c: CustomerRow; canDelete: boolean }) {
  const facts = [
    `${num(c.deals)} ${c.deals === 1 ? "deal" : "deals"}`,
    c.wonVehicles ? `${num(c.onRoad)} of ${num(c.wonVehicles)} on road` : null,
    c.openDeals ? `${num(c.openDeals)} open` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center hover:bg-canvas">
    <Link
      href={`/customers/${c.id}`}
      className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-4 py-3 active:bg-canvas"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{c.name}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-muted">{facts.join(" · ")}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {c.uncovered ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              <AlertTriangle size={11} aria-hidden="true" />
              No agreement
              {c.uncovered > 1 ? ` · ${c.uncovered} deals` : ""}
            </span>
          ) : null}
          {c.deals === 0 ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              No deals
            </span>
          ) : null}
          {c.agreements ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              <FileText size={11} aria-hidden="true" />
              {c.agreements} {c.agreements === 1 ? "agreement" : "agreements"}
            </span>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {c.monthlyRevenue ? (
          <>
            <p className="tabular text-[15px] font-bold text-emerald-700">
              {inrCompact(c.monthlyRevenue)}
            </p>
            <p className="text-[11px] text-muted">won / mo</p>
          </>
        ) : c.openValue ? (
          <>
            <p className="tabular text-[15px] font-semibold">{inrCompact(c.openValue)}</p>
            <p className="text-[11px] text-muted">pipeline / mo</p>
          </>
        ) : null}
      </div>
      {canDelete ? null : (
        <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden="true" />
      )}
    </Link>
    {/* Beside the link, not in it: a button inside a link is invalid HTML
        and one control to a screen reader. */}
    {canDelete ? (
      <div className="pr-2">
        <DeleteCustomer id={c.id} name={c.name} compact />
      </div>
    ) : null}
    </div>
  );
}

/** Agreements up for renewal within 60 days, or already past it. */
function Renewals({ renewals, today }: { renewals: Renewal[]; today: string }) {
  return (
    <section className="mb-4 rounded-[14px] border border-amber-200 bg-amber-50/60">
      <h2 className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[13px] font-semibold uppercase tracking-wide text-amber-900">
        <CalendarClock size={14} aria-hidden="true" />
        Renewals due
      </h2>
      <ul className="divide-y divide-amber-200/70">
        {renewals.map((r) => {
          const days = daysUntil(r.renewalOn, today);
          return (
            <li key={r.id}>
              <Link
                href={`/customers/${r.accountId}`}
                className="flex min-h-12 items-center gap-3 px-4 py-2.5 active:opacity-70"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{r.accountName}</p>
                  <p className="truncate text-[12.5px] text-muted">
                    {/* The date first: it is the reason the row is here,
                        and a long deal name would truncate it away. */}
                    {AGREEMENT_TYPE_LABEL[r.type]} · renews {formatDate(r.renewalOn)}
                    {r.dealName ? ` · ${r.dealName}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "tabular shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold",
                    days < 0 ? "bg-rose-100 text-rose-700" : "bg-white text-amber-800",
                  )}
                >
                  {days < 0
                    ? `${-days} ${days === -1 ? "day" : "days"} late`
                    : days === 0
                      ? "today"
                      : `in ${days} ${days === 1 ? "day" : "days"}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="px-4 pb-3 pt-1 text-[12px] text-amber-900/80">
        Upload the renewed agreement with its new renewal date and the reminder
        clears itself.
      </p>
    </section>
  );
}
