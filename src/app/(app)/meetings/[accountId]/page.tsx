import { CalendarClock, CornerDownRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { AddFollowUp } from "@/components/meetings/add-follow-up";
import { DesktopOnlyNotice } from "@/components/meetings/desktop-only";
import { FollowUpRow } from "@/components/meetings/follow-up-row";
import { LogMeeting } from "@/components/meetings/log-meeting";
import { StrategicToggle } from "@/components/meetings/strategic-toggle";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui-server";
import {
  dueLabel,
  KIND_LABEL,
  LEVEL_CHIP,
  LEVEL_LABEL,
  MEETING_STATUS_LABEL,
  STATUS_META,
  threadOf,
  type BoardState,
} from "@/lib/meetings";
import { meetingId } from "@/lib/record-ids";
import { cn, formatDate, formatDateCompact, num } from "@/lib/utils";
import { requireSales } from "@/server/auth";
import {
  getAccountThread,
  loadMeetingFormData,
  type ThreadMeeting,
} from "@/server/meeting-queries";

export const dynamic = "force-dynamic";

/**
 * One customer's whole engagement history.
 *
 * A leadership meeting carries its regional follow-ups indented beneath it, so
 * the chain from "their CSCO asked for Pune" to what happened on the ground
 * reads top to bottom with nothing restated. The way forward is at the top,
 * because that is what somebody opening this page at 9am needs.
 */
export default async function AccountMeetingsPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const [session, data] = await Promise.all([requireSales(), getAccountThread(accountId)]);
  if (!data) notFound();

  const { account, thread, state, business, counts, today } = data;
  const formData = await loadMeetingFormData(accountId);
  const groups = threadOf(thread);

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink fallbackHref="/meetings" fallbackLabel="Meetings" />

      <div className="md:hidden">
        <DesktopOnlyNotice what="Meetings" />
      </div>

      <div className="hidden md:block">
        <div className="mb-3 rounded-2xl border border-line bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                Customer
              </p>
              <h1 className="mt-1 text-[22px] font-bold tracking-[-0.02em]">
                {account.name}
              </h1>
              <p className="mt-1 text-[13px] text-muted">
                {business.owners.length
                  ? `Deal owner${business.owners.length > 1 ? "s" : ""}: ${business.owners.join(", ")}`
                  : "No deal owner"}
                {business.soldVehicles
                  ? ` · ${num(business.liveVehicles)} of ${num(business.soldVehicles)} vehicles live`
                  : ""}
                {business.openDeals ? ` · ${num(business.openDeals)} open deals` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {session.role === "admin" ? (
                <StrategicToggle
                  accountId={account.id}
                  isStrategic={account.isStrategic}
                  name={account.name}
                />
              ) : account.isStrategic ? (
                <Badge className="bg-amber-50 text-amber-900">Strategic</Badge>
              ) : null}
              <Link
                href={`/customers/${account.id}`}
                className="inline-flex h-10 items-center rounded-xl border border-line px-3 text-[13px] font-semibold text-ink hover:bg-canvas"
              >
                Deals and agreements
              </Link>
              <LogMeeting
                accounts={formData.accounts}
                users={formData.users}
                topics={formData.topics}
                cities={formData.cities}
                today={formData.today}
                me={formData.me}
                isAdmin={session.role === "admin"}
                accountId={account.id}
                extras={{
                  contacts: formData.contacts,
                  deals: formData.deals,
                  parents: formData.parents,
                }}
              />
            </div>
          </div>
        </div>

        <WayForward state={state} today={today} />

        <dl className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Stat
            label="Last met"
            value={
              state.daysSinceLastMeeting === null
                ? "Never"
                : state.daysSinceLastMeeting === 0
                  ? "Today"
                  : `${num(state.daysSinceLastMeeting)}d ago`
            }
            sub={`${num(counts.held)} held · ${num(counts.leadership)} at CXO level`}
          />
          <Stat
            label="Open follow-ups"
            value={num(counts.openFollowUps)}
            sub={
              counts.overdueFollowUps
                ? `${num(counts.overdueFollowUps)} past their date`
                : "none late"
            }
            tone={counts.overdueFollowUps ? "bad" : undefined}
          />
          <Stat
            label="People on file"
            value={num(formData.contacts.length)}
            sub="their side, with designations"
          />
          <Stat
            label="Meetings"
            value={num(thread.length)}
            sub="including the ones still planned"
          />
        </dl>

        <Card>
          <CardHeader
            title="Meeting thread"
            action={
              <span className="text-[12px] text-muted">
                Newest first · follow-up meetings sit under the one they came from
              </span>
            }
          />
          {groups.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No meetings logged yet"
                body="Log the first one — who was there, what was discussed, and what we committed to."
              />
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {groups.map(({ meeting, children }) => (
                <div key={meeting.id} className="space-y-2">
                  <MeetingCard
                    m={meeting}
                    today={today}
                    users={formData.users}
                    contacts={formData.contacts}
                  />
                  {children.map((child) => (
                    <div
                      key={child.id}
                      className="ml-5 border-l-2 border-line pl-3"
                    >
                      <MeetingCard
                        m={child}
                        today={today}
                        users={formData.users}
                        contacts={formData.contacts}
                        child
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** The one line somebody opening this page needs: what happens next. */
function WayForward({ state, today }: { state: BoardState; today: string }) {
  const meta = STATUS_META[state.status];
  const wf = state.wayForward;

  return (
    <div
      className={cn(
        "mb-3 rounded-[14px] border bg-white p-4",
        state.late ? "border-rose-200" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          Way forward
        </p>
        <Badge
          className={cn(
            meta.chip,
            state.late && state.status === "waiting_on_us" && "bg-rose-50 text-rose-700",
          )}
        >
          {meta.label}
        </Badge>
      </div>
      {wf === null ? (
        <p className="mt-1.5 text-[15px] italic text-muted">
          Nothing agreed and nothing in the diary. Add a follow-up on the last
          meeting, or log the next one.
        </p>
      ) : wf.kind === "follow_up" ? (
        <>
          <p className="mt-1.5 text-[15px] font-semibold tracking-[-0.01em]">
            {wf.followUp.description}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {wf.followUp.side === "us"
              ? wf.followUp.ownerName
              : `${wf.followUp.ownerName} — the customer's side`}
            {" · "}
            <span className={cn(wf.daysLate > 0 && "font-semibold text-rose-700")}>
              {formatDate(wf.followUp.dueOn)} · {dueLabel(wf.followUp.dueOn, today)}
            </span>
            {" · from "}
            {meetingId(wf.followUp.meetingRef)}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1.5 flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
            <CalendarClock size={16} className="shrink-0 text-muted" aria-hidden="true" />
            {wf.meeting.title}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {wf.meeting.ownerName} · planned {formatDate(wf.meeting.metOn)}
            {wf.inDays >= 0
              ? ` · in ${num(wf.inDays)} ${wf.inDays === 1 ? "day" : "days"}`
              : " · that date has passed"}
          </p>
        </>
      )}
    </div>
  );
}

function MeetingCard({
  m,
  today,
  users,
  contacts,
  child,
}: {
  m: ThreadMeeting;
  today: string;
  users: { id: string; name: string }[];
  contacts: { id: string; name: string; designation: string | null }[];
  child?: boolean;
}) {
  const planned = m.status === "planned";

  return (
    <div
      className={cn(
        "rounded-[14px] border border-line bg-white p-3.5",
        child && "bg-canvas/40",
        planned && "border-dashed",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold tracking-wide text-muted">
          {meetingId(m.ref)}
        </span>
        <Badge className={LEVEL_CHIP[m.level]}>{LEVEL_LABEL[m.level]}</Badge>
        <Badge className="bg-canvas text-muted">{KIND_LABEL[m.kind]}</Badge>
        {planned ? (
          <Badge className="bg-brand-soft text-brand-ink">
            {MEETING_STATUS_LABEL.planned}
          </Badge>
        ) : null}
        {m.status === "cancelled" ? (
          <Badge className="bg-canvas text-muted">Cancelled</Badge>
        ) : null}
        {m.confidential ? (
          <Badge className="bg-rose-50 text-rose-700">Confidential</Badge>
        ) : null}
        {child ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            <CornerDownRight size={12} aria-hidden="true" />
            follow-up meeting
          </span>
        ) : null}
        <span className="ml-auto text-[12px] text-muted">
          {formatDate(m.metOn)}
          {m.city ? ` · ${m.city}` : ""}
        </span>
      </div>

      <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.01em]">{m.title}</h3>

      <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            MoEVing
          </p>
          <p className="mt-0.5 text-[13px]">
            {m.us.length ? m.us.join(", ") : m.ownerName}
          </p>
        </div>
        {m.them.length ? (
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Their side
            </p>
            <p className="mt-0.5 text-[13px]">
              {m.them
                .map((p) => (p.designation ? `${p.name}, ${p.designation}` : p.name))
                .join(" · ")}
            </p>
          </div>
        ) : null}
      </div>

      {m.notes ? (
        <p className="mt-2.5 whitespace-pre-line text-[13.5px] leading-relaxed">
          {m.notes}
        </p>
      ) : null}
      {planned && m.agenda ? (
        <p className="mt-2.5 whitespace-pre-line text-[13.5px] leading-relaxed text-muted">
          Agenda: {m.agenda}
        </p>
      ) : null}
      {planned && m.metOn < today ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          This date has passed and it is still marked planned. Log what happened,
          or the account reads as having no next step.
        </p>
      ) : null}

      {m.topics.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {m.topics.map((t) => (
            <Badge key={t} className="bg-canvas text-muted">
              {t}
            </Badge>
          ))}
        </div>
      ) : null}

      {m.dealName ? (
        <p className="mt-2.5 text-[12.5px] text-muted">
          About{" "}
          <Link
            href={`/opportunities/${m.dealId}`}
            className="font-medium text-brand-ink underline-offset-2 hover:underline"
          >
            {m.dealName}
          </Link>
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {m.followUps.map((f) => (
          <FollowUpRow
            key={f.id}
            item={{
              id: f.id,
              description: f.description,
              dueOn: f.dueOn,
              status: f.status,
              side: f.side,
              ownerName: f.ownerName,
              closedNote: f.closedNote,
              closedByName: f.closedByName,
            }}
            today={today}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted">
          {m.createdByName && m.createdByName !== m.ownerName
            ? `${m.ownerName}'s meeting · logged by ${m.createdByName}`
            : `${m.ownerName}'s meeting`}
          {m.followUps.length
            ? ` · ${num(m.followUps.filter((f) => f.status === "open").length)} of ${num(m.followUps.length)} follow-ups open`
            : " · no follow-ups yet"}
        </p>
        <AddFollowUp
          meetingId={m.id}
          users={users}
          contacts={contacts}
          today={today}
          defaultOwnerUserId={users.find((u) => u.name === m.ownerName)?.id}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "bad";
}) {
  return (
    <div className="rounded-[14px] border border-line bg-white px-3.5 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "tabular mt-1 text-[19px] font-bold leading-none tracking-[-0.02em]",
          tone === "bad" && "text-rose-700",
        )}
      >
        {value}
      </dd>
      <dd className="mt-1 text-[11.5px] text-muted">{sub}</dd>
    </div>
  );
}
