"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Phone,
  Plus,
  Search,
  ThumbsDown,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { LeadFunnel } from "@/components/leads/funnel";
import type { MasterData } from "@/components/quick-add";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PickerField,
  Segmented,
  Sheet,
  Textarea,
} from "@/components/ui";
import type { LeadStatus } from "@/db/schema";
import { OPERATING_DAYS } from "@/lib/constants";
import { showToast } from "@/lib/toast";
import {
  cn,
  formatDate,
  formatDateTimeInIndia,
  monthLabelShort, num, todayInIndia, upcomingMonths } from "@/lib/utils";
import { actionLead, convertLead, createLead } from "@/server/actions";
import type { LeadRow } from "@/server/queries";

export const LEAD_STATUS: Record<
  LeadStatus,
  { label: string; short: string; chip: string }
> = {
  new: { label: "Not called yet", short: "New", chip: "bg-amber-100 text-amber-900" },
  qualified: {
    label: "Qualified",
    short: "Qualified",
    chip: "bg-emerald-100 text-emerald-900",
  },
  not_qualified: {
    label: "Not qualified",
    short: "Not qualified",
    chip: "bg-rose-100 text-rose-800",
  },
  converted: { label: "Became a deal", short: "Deal", chip: "bg-brand-soft text-brand-ink" },
};

/**
 * Inbound enquiries, and what was said about them.
 *
 * The desk that answers the phone writes a lead down; a deal owner rings back
 * and leaves a remark either way. The remark is the screen's whole point — a
 * status with no sentence behind it tells the next person nothing — so it is
 * shown in the list rather than hidden behind a tap.
 */
/** Lead cards drawn per tap of "Show more". */
const PAGE = 40;

export function LeadsBoard({
  leads,
  master,
  canAction,
  canCreate,
}: {
  leads: LeadRow[];
  master: MasterData;
  /** Deal owners and admins ring leads back and convert them. */
  canAction: boolean;
  /** The NOC desk and admins write them down. */
  canCreate: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"open" | "all">("open");
  const [adding, setAdding] = React.useState(false);
  const [acting, setActing] = React.useState<{
    lead: LeadRow;
    mode: "qualified" | "not_qualified";
  } | null>(null);
  const [converting, setConverting] = React.useState<LeadRow | null>(null);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      // "Open" is everything still waiting on somebody: the calls not made,
      // and the qualified ones nobody has turned into a deal yet.
      if (
        filter === "open" &&
        (l.status === "not_qualified" || l.status === "converted")
      ) {
        return false;
      }
      if (!q) return true;
      return [l.companyName, l.callingCity, l.callerName, l.mobile, l.email]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [leads, query, filter]);

  /**
   * How many cards are in the DOM. Every lead still arrives and search and
   * the funnel still run over all of them; only the drawing waits until
   * somebody scrolls that far. A new search or filter starts from the top.
   */
  const [limit, setLimit] = React.useState(PAGE);
  React.useEffect(() => setLimit(PAGE), [query, filter]);

  const waiting = leads.filter((l) => l.status === "new").length;

  return (
    <div>
      {/* Deal outcomes are deal information, so the funnel is for the people
          who work deals. The NOC desk writes leads down and sees nothing
          else — a won/lost count is the pipeline by another name. */}
      {canAction ? <LeadFunnel leads={leads} /> : null}

      {/* Two rows on a phone, one from `sm` up.
          As a single wrapping row these three came to ~490px on a 390px
          screen: the search box, the only one allowed to shrink, collapsed to
          44px and the switch sat on top of its own placeholder. */}
      <div className="mb-4 space-y-2 sm:flex sm:items-center sm:gap-2 sm:space-y-0">
        <div className="relative min-w-0 sm:flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Company, city, caller or number"
            className="h-12 pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            label="Which leads"
            className="min-w-0 flex-1 sm:w-[190px] sm:flex-none"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Open" },
              { value: "all", label: "All" },
            ]}
          />
          {canCreate ? (
            // 48px, like the search box and the switch beside it: three
            // controls on one row at three heights reads as an accident.
            <Button
              variant="brand"
              size="lg"
              className="shrink-0"
              onClick={() => setAdding(true)}
            >
              <Plus size={17} /> New lead
            </Button>
          ) : null}
        </div>
      </div>

      {waiting > 0 ? (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          <Phone size={15} />
          {waiting} {waiting === 1 ? "enquiry has" : "enquiries have"} not been
          called back yet.
        </p>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          title={query ? "No leads match" : "No open leads"}
          body={
            query
              ? "Clear the search to see the rest."
              : "Enquiries the desk writes down appear here."
          }
        />
      ) : (
        <div className="space-y-2">
          {shown.slice(0, limit).map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              canAction={canAction}
              onQualify={() => setActing({ lead, mode: "qualified" })}
              onReject={() => setActing({ lead, mode: "not_qualified" })}
              onConvert={() => setConverting(lead)}
            />
          ))}
          {shown.length > limit ? (
            <button
              onClick={() => setLimit((n) => n + PAGE)}
              className="h-12 w-full rounded-2xl border border-line bg-white text-[14px] font-semibold text-brand-ink active:bg-canvas"
            >
              Show {Math.min(PAGE, shown.length - limit)} more
              <span className="ml-1 font-normal text-muted">
                ({shown.length - limit} left)
              </span>
            </button>
          ) : null}
        </div>
      )}

      {adding ? <LeadForm onClose={() => setAdding(false)} /> : null}
      {acting ? (
        <ActionSheet
          lead={acting.lead}
          mode={acting.mode}
          onClose={() => setActing(null)}
        />
      ) : null}
      {converting ? (
        <ConvertSheet
          lead={converting}
          master={master}
          onClose={() => setConverting(null)}
        />
      ) : null}
    </div>
  );
}

function LeadCard({
  lead,
  canAction,
  onQualify,
  onReject,
  onConvert,
}: {
  lead: LeadRow;
  canAction: boolean;
  onQualify: () => void;
  onReject: () => void;
  onConvert: () => void;
}) {
  const status = LEAD_STATUS[lead.status];

  return (
    <div
      className={cn(
        "rounded-[14px] border border-l-4 border-line bg-white p-4",
        OUTCOME_EDGE[lead.status],
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[15px] font-semibold">{lead.companyName}</p>
            <Badge className={status.chip}>{status.short}</Badge>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {[
              lead.callingCity,
              lead.vehicleRequirement
                ? `${num(lead.vehicleRequirement)} × ${lead.vehicleType ?? "vehicle"}`
                : lead.vehicleType,
              lead.typeOfGoods,
            ]
              .filter(Boolean)
              .join(" · ") || "No details given"}
          </p>
        </div>
        <span className="tabular shrink-0 text-[12.5px] text-muted">
          {formatDate(lead.enquiryDate)}
        </span>
      </div>

      {lead.callerName || lead.mobile || lead.email ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {lead.callerName ? (
            <span className="font-medium">
              {lead.callerName}
              {lead.designation ? (
                <span className="font-normal text-muted"> · {lead.designation}</span>
              ) : null}
            </span>
          ) : null}
          {/* Tappable on a phone, which is the whole job of this screen. */}
          {lead.mobile ? (
            <a
              href={`tel:${lead.mobile}`}
              className="text-brand-ink underline-offset-2 hover:underline"
            >
              {lead.mobile}
            </a>
          ) : null}
          {lead.email ? (
            <a
              href={`mailto:${lead.email}`}
              className="truncate text-brand-ink underline-offset-2 hover:underline"
            >
              {lead.email}
            </a>
          ) : null}
        </div>
      ) : null}

      <LeadOutcome lead={lead} />

      {canAction && lead.status !== "converted" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {lead.status === "qualified" ? (
            <Button variant="brand" onClick={onConvert}>
              <ArrowRight size={16} /> Convert to deal
            </Button>
          ) : (
            <Button variant="secondary" onClick={onQualify}>
              <Check size={16} /> Qualified
            </Button>
          )}
          <Button variant="secondary" onClick={onReject}>
            <ThumbsDown size={16} /> Not qualified
          </Button>
          {lead.status === "qualified" ? (
            <Button variant="secondary" onClick={onQualify}>
              Add a remark
            </Button>
          ) : null}
        </div>
      ) : null}

      {lead.status === "converted" && lead.opportunityId ? (
        <Link
          href={`/opportunities/${lead.opportunityId}`}
          className="mt-3 inline-flex h-11 items-center gap-1.5 text-[13px] font-semibold text-brand-ink"
        >
          Open the deal <ArrowRight size={15} />
        </Link>
      ) : null}
    </div>
  );
}

/** The card's left edge: the outcome, readable from across the list. */
const OUTCOME_EDGE: Record<LeadStatus, string> = {
  new: "border-l-amber-400",
  qualified: "border-l-emerald-500",
  not_qualified: "border-l-rose-500",
  converted: "border-l-emerald-600",
};

/**
 * What a deal owner did with the lead, said loudly.
 *
 * The desk that wrote the lead down cannot see the pipeline, so this panel is
 * the only way it learns whether anybody rang back: who, when, which way it
 * went, and what they said. Green for qualified or a deal, red for no, amber
 * while nobody has called.
 *
 * A lead keeps one `remarks` column. Before a deal owner acts it holds what
 * the desk wrote; afterwards it holds the deal owner's remark — so the label
 * follows `actionedBy`, not the status.
 */
function LeadOutcome({ lead }: { lead: LeadRow }) {
  const who = lead.actionedBy;
  const when = lead.actionedAt ? formatDateTimeInIndia(lead.actionedAt) : null;

  if (lead.status === "new" && !who) {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
        <p className="flex items-center gap-1.5 font-semibold">
          <Clock size={15} /> No deal owner has reached out yet
        </p>
        {lead.remarks ? (
          <p className="mt-1 text-amber-900/80">
            <span className="font-medium">Desk note:</span> {lead.remarks}
          </p>
        ) : null}
      </div>
    );
  }

  const negative = lead.status === "not_qualified";
  const heading =
    lead.status === "converted"
      ? who
        ? `Qualified by ${who} · now a deal`
        : "Converted to a deal"
      : negative
        ? `Not qualified by ${who ?? "a deal owner"}`
        : `Qualified by ${who ?? "a deal owner"}`;

  return (
    <div
      className={cn(
        "mt-3 rounded-xl border px-3 py-2.5 text-[13px]",
        negative
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-900",
      )}
    >
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {negative ? (
          <XCircle size={16} className="shrink-0" />
        ) : (
          <CheckCircle2 size={16} className="shrink-0" />
        )}
        <span className="font-semibold">{heading}</span>
        {when ? <span className="tabular opacity-70">· {when}</span> : null}
      </p>
      {negative && lead.notQualifiedReason ? (
        <p className="mt-1">
          <span className="font-medium">Reason:</span> {lead.notQualifiedReason}
        </p>
      ) : null}
      {lead.remarks ? (
        <p className="mt-1">
          <span className="font-medium">{who ? "Remarks:" : "Desk note:"}</span>{" "}
          {lead.remarks}
        </p>
      ) : null}
    </div>
  );
}

/** Qualifying, or saying why not. Both need a sentence. */
function ActionSheet({
  lead,
  mode,
  onClose,
}: {
  lead: LeadRow;
  mode: "qualified" | "not_qualified";
  onClose: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [remarks, setRemarks] = React.useState(lead.remarks ?? "");
  const [reason, setReason] = React.useState(lead.notQualifiedReason ?? "");

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await actionLead(lead.id, { status: mode, remarks, reason });
      if (!result.ok) return setError(result.error);
      showToast(
        `${lead.companyName} marked ${mode === "qualified" ? "qualified" : "not qualified"}`,
      );
      onClose();
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === "qualified" ? "Qualified" : "Not qualified"}
      footer={
        <Button
          variant="brand"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      }
    >
      <p className="-mt-1 mb-4 truncate text-sm text-muted">{lead.companyName}</p>
      <div className="space-y-4">
        <Field
          label="What did they say?"
          hint="One line is enough. Whoever picks this up next reads this first."
        >
          <Textarea
            value={remarks}
            autoFocus
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Wants 12 vehicles from November, comparing us with two others."
          />
        </Field>
        {mode === "not_qualified" ? (
          <Field label="Why is this not a deal?">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Budget, wrong vehicle, already contracted…"
            />
          </Field>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * The lead becoming a deal.
 *
 * The enquiry says "3W" and "Bangalore"; a deal needs a vehicle type and a
 * city from the master lists. Rather than guess a mapping, the form asks —
 * with what the caller said printed beside it, so the answer is one glance
 * away.
 */
function ConvertSheet({
  lead,
  master,
  onClose,
}: {
  lead: LeadRow;
  master: MasterData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [month, setMonth] = React.useState("");
  const [days, setDays] = React.useState<number | null>(null);
  const months = React.useMemo(() => upcomingMonths(6), []);

  // Where the caller's city plainly names one of ours, start there.
  const guessedCity =
    master.cities.find(
      (c) =>
        lead.callingCity &&
        c.name.toLowerCase().includes(lead.callingCity.trim().toLowerCase()),
    )?.id ?? "";

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await convertLead(lead.id, formData);
      if (!result.ok) return setError(result.error);
      showToast(`${lead.companyName} is a deal now`);
      onClose();
      router.push(`/opportunities/${result.data!.id}`);
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Convert to deal"
      action={submit}
      footer={
        <Button variant="brand" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating…" : "Create deal"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-soft/60 px-4 py-3 text-sm">
          <p className="font-medium text-brand-ink">{lead.companyName}</p>
          <p className="mt-0.5 text-muted">
            Asked for{" "}
            {lead.vehicleRequirement ? `${num(lead.vehicleRequirement)} × ` : ""}
            {lead.vehicleType ?? "vehicles"}
            {lead.callingCity ? ` in ${lead.callingCity}` : ""}. The caller&apos;s
            name, number and remarks go into the deal&apos;s notes.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="City" hint={lead.callingCity ?? undefined}>
            <PickerField
              label="City"
              name="cityId"
              defaultValue={guessedCity}
              options={master.cities.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <Field label="Vehicle" hint={lead.vehicleType ?? undefined}>
            <PickerField
              label="Vehicle"
              name="vehicleTypeId"
              defaultValue=""
              options={master.vehicleTypes.map((v) => ({
                value: v.id,
                label: v.name,
              }))}
            />
          </Field>
          <Field label="Fleet size">
            <Input
              name="fleetSize"
              inputMode="numeric"
              required
              defaultValue={lead.vehicleRequirement ?? ""}
            />
          </Field>
          <Field label="Price / vehicle / mo">
            <Input name="price" inputMode="numeric" placeholder="₹" />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
            Operating days a month
          </p>
          <div className="flex gap-2">
            {OPERATING_DAYS.map((d) => {
              const on = days === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays(on ? null : d.value)}
                  className={cn(
                    "flex h-12 flex-1 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition",
                    on
                      ? "border-brand bg-brand-soft text-brand-ink"
                      : "border-line bg-white text-muted",
                  )}
                >
                  {d.label}
                  <span className="text-[11px] font-normal opacity-70">{d.hint}</span>
                </button>
              );
            })}
          </div>
          <input type="hidden" name="operatingDays" value={days ?? ""} />
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
            Expected closing month
          </p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {months.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={month === m}
                onClick={() => setMonth(m)}
                className={cn(
                  "h-11 shrink-0 rounded-xl border px-4 text-sm font-medium transition",
                  month === m
                    ? "border-brand bg-brand-soft text-brand-ink"
                    : "border-line bg-white text-muted",
                )}
              >
                {monthLabelShort(m)}
              </button>
            ))}
          </div>
          <input type="hidden" name="expectedCloseMonth" value={month} />
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

/** The desk writing down a call. Only the company and the date are required. */
function LeadForm({ onClose }: { onClose: () => void }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [typed, setTyped] = React.useState(false);
  const today = React.useMemo(() => todayInIndia(), []);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createLead(formData);
      if (!result.ok) return setError(result.error);
      showToast("Lead saved");
      onClose();
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="New lead"
      action={submit}
      confirmDiscard={typed && !pending}
      footer={
        <Button variant="brand" size="lg" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save lead"}
        </Button>
      }
    >
      <div className="space-y-4" onInput={() => setTyped(true)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of enquiry">
            <Input type="date" name="enquiryDate" required defaultValue={today} />
          </Field>
          {/* Nearly every enquiry arrives off a Google search, so that is
              what the field starts as — it is still free text, and typing
              over it is one tap. */}
          <Field label="Found MoEVing on">
            <Input name="foundOn" defaultValue="Google search" />
          </Field>
        </div>
        <Field label="Company name">
          <Input name="companyName" required autoFocus placeholder="Ksherera Dairy" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type of goods">
            <Input name="typeOfGoods" placeholder="Milk can" />
          </Field>
          <Field label="Calling city">
            <Input name="callingCity" placeholder="Bangalore" />
          </Field>
          <Field label="Vehicles needed">
            <Input name="vehicleRequirement" inputMode="numeric" placeholder="1" />
          </Field>
          <Field label="Vehicle type">
            <Input name="vehicleType" placeholder="3W" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Caller name">
            <Input name="callerName" placeholder="Ajith S" />
          </Field>
          <Field label="Designation">
            <Input name="designation" placeholder="Manager" />
          </Field>
          <Field label="Mobile number">
            <Input name="mobile" inputMode="tel" placeholder="99800 75529" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" placeholder="name@company.com" />
          </Field>
        </div>
        {/* What the caller actually said. The desk hears it once, on the
            phone; without somewhere to put it here it is lost before a deal
            owner ever opens the lead. */}
        <Field
          label="Remarks"
          hint="Anything the caller said that the person ringing back should know."
        >
          <Textarea
            name="remarks"
            placeholder="Needs 6 vehicles from November for a Bangalore milk run."
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
