import { ArrowRight, Star } from "lucide-react";
import Link from "next/link";

import { DesktopOnlyNotice } from "@/components/meetings/desktop-only";
import { FollowUpRow } from "@/components/meetings/follow-up-row";
import { LogMeeting } from "@/components/meetings/log-meeting";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui-server";
import {
  BUCKET_LABEL,
  bucketFollowUps,
  dueLabel,
  LEVEL_CHIP,
  LEVEL_LABEL,
  STALE_DAYS,
  STATUS_META,
} from "@/lib/meetings";
import { meetingId } from "@/lib/record-ids";
import { cn, formatDateCompact, num } from "@/lib/utils";
import { requireSales } from "@/server/auth";
import { getMeetingBoard, listFollowUps, loadMeetingFormData } from "@/server/meeting-queries";

export const dynamic = "force-dynamic";

/**
 * The leadership view of the strategic accounts.
 *
 * It answers one question without anybody opening anything: for each key
 * customer, what is the next thing that has to happen, who owns it, and is it
 * late. Rows come worst-first, because this screen is for finding the problems
 * — looking a customer up is what Customers is for.
 *
 * Every status on it is computed from open follow-ups and their dates
 * (`lib/meetings.ts`), so nobody can mark an account green by hand.
 */
export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; scope?: string; who?: string }>;
}) {
  const { tab, scope, who } = await searchParams;
  const onFollowUps = tab === "follow-ups";
  const allCustomers = scope === "all";
  const mine = who !== "team";

  const session = await requireSales();
  const [board, followUps, formData] = await Promise.all([
    onFollowUps ? null : getMeetingBoard(allCustomers ? "all" : "strategic"),
    onFollowUps ? listFollowUps(mine ? "mine" : "team") : null,
    loadMeetingFormData(),
  ]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <p className="mt-0.5 text-sm text-muted">
            What we discussed with key customers, and who owes the next move.
          </p>
        </div>
        <div className="hidden md:block">
          <LogMeeting
            accounts={formData.accounts}
            users={formData.users}
            topics={formData.topics}
            cities={formData.cities}
            today={formData.today}
            me={formData.me}
            isAdmin={session.role === "admin"}
          />
        </div>
      </div>

      <div className="md:hidden">
        <DesktopOnlyNotice what="Meetings" />
      </div>

      <div className="hidden md:block">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Tabs
            options={[
              { href: "/meetings", label: "Accounts", on: !onFollowUps },
              {
                href: "/meetings?tab=follow-ups",
                label: "Follow-ups",
                on: onFollowUps,
              },
            ]}
          />
          {onFollowUps ? (
            <Tabs
              options={[
                { href: "/meetings?tab=follow-ups", label: "On me", on: mine },
                {
                  href: "/meetings?tab=follow-ups&who=team",
                  label: "Whole team",
                  on: !mine,
                },
              ]}
            />
          ) : (
            <Tabs
              options={[
                { href: "/meetings", label: "Strategic", on: !allCustomers },
                { href: "/meetings?scope=all", label: "Every customer", on: allCustomers },
              ]}
            />
          )}
        </div>

        {board ? <Board board={board} allCustomers={allCustomers} /> : null}
        {followUps ? <FollowUps data={followUps} mine={mine} /> : null}
      </div>
    </div>
  );
}

function Tabs({
  options,
}: {
  options: { href: string; label: string; on: boolean }[];
}) {
  return (
    <div className="flex h-11 rounded-xl border border-line bg-white p-[3px]">
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.on ? "page" : undefined}
          className={cn(
            "flex h-full items-center rounded-lg px-3.5 text-sm font-semibold transition",
            o.on ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function Board({
  board,
  allCustomers,
}: {
  board: Awaited<ReturnType<typeof getMeetingBoard>>;
  allCustomers: boolean;
}) {
  const { accounts, summary, today } = board;

  if (accounts.length === 0) {
    return (
      <EmptyState
        title={allCustomers ? "No meetings logged yet" : "No strategic accounts yet"}
        body={
          allCustomers
            ? "Log the first meeting and it appears here, with whatever was agreed in it."
            : "An admin marks a customer strategic on its meetings page. Those are the ones leadership watches here."
        }
      />
    );
  }

  return (
    <>
      <dl className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Tile
          label="Met this quarter"
          value={`${num(summary.metThisQuarter)} / ${num(summary.strategic)}`}
          sub={
            summary.strategic - summary.metThisQuarter > 0
              ? `${num(summary.strategic - summary.metThisQuarter)} not seen this quarter`
              : "every account seen"
          }
        />
        <Tile
          label="CXO meetings"
          value={num(summary.cxoMeetings)}
          sub="leadership level, this quarter"
        />
        <Tile
          label="Follow-ups overdue"
          value={num(summary.overdue)}
          sub={summary.overdue ? "somebody is waiting on us" : "nothing late"}
          tone={summary.overdue ? "bad" : "good"}
        />
        <Tile
          label="No next step"
          value={num(summary.noNextStep)}
          sub="last meeting closed without one"
          tone={summary.noNextStep ? "warn" : "good"}
        />
      </dl>

      <Card>
        <CardHeader
          title={allCustomers ? "Every customer with a meeting" : "Strategic accounts"}
          action={
            <span className="text-[12px] text-muted">
              Worst first · {num(accounts.length)}{" "}
              {accounts.length === 1 ? "account" : "accounts"}
            </span>
          }
        />
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_136px_minmax(0,1.7fr)] gap-3 border-y border-line bg-canvas px-4 py-2">
              {["Customer", "Last meeting", "Status", "Way forward"].map((h) => (
                <span
                  key={h}
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted"
                >
                  {h}
                </span>
              ))}
            </div>
            {accounts.map((a) => {
              const meta = STATUS_META[a.state.status];
              const wf = a.state.wayForward;
              return (
                <div
                  key={a.accountId}
                  className="relative grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_136px_minmax(0,1.7fr)] gap-3 border-b border-line py-3 pl-4 pr-4 last:border-b-0"
                >
                  {/* The severity stripe, the same device as Forecast's
                      Overdue column: what is wrong is visible before any
                      number is read. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-y-0 left-0 w-[3px] rounded-r",
                      meta.stripe,
                    )}
                  />
                  <div className="min-w-0">
                    <Link
                      href={`/meetings/${a.accountId}`}
                      className="flex items-center gap-1.5 text-[14px] font-semibold underline-offset-2 hover:underline"
                    >
                      <span className="truncate">{a.name}</span>
                      {a.isStrategic ? (
                        <Star
                          size={12}
                          className="shrink-0 fill-amber-400 text-amber-500"
                          aria-label="Strategic"
                        />
                      ) : null}
                    </Link>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">
                      {a.cities.length ? a.cities.join(", ") : "No city"}
                      {a.soldVehicles
                        ? ` · ${num(a.liveVehicles)} / ${num(a.soldVehicles)} live`
                        : ""}
                      {a.openDeals ? ` · ${num(a.openDeals)} open` : ""}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted">
                      {a.owners.length ? a.owners.join(", ") : "No deal owner"}
                    </p>
                  </div>

                  <div className="min-w-0">
                    {a.lastHeld ? (
                      <>
                        <p className="text-[13px]">
                          {formatDateCompact(a.lastHeld.metOn)}
                          <span className="text-muted">
                            {" · "}
                            {a.state.daysSinceLastMeeting === 0
                              ? "today"
                              : `${num(a.state.daysSinceLastMeeting)}d ago`}
                          </span>
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge className={LEVEL_CHIP[a.lastHeld.level]}>
                            {LEVEL_LABEL[a.lastHeld.level]}
                          </Badge>
                          <span className="truncate text-[12px] text-muted">
                            {a.lastHeld.ownerName}
                          </span>
                        </p>
                      </>
                    ) : (
                      <p className="text-[13px] italic text-muted">Never met</p>
                    )}
                    {a.cxoMeetings ? (
                      <p className="mt-1 text-[12px] text-muted">
                        {num(a.cxoMeetings)} CXO{" "}
                        {a.cxoMeetings === 1 ? "meeting" : "meetings"} this year
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <Badge
                      className={cn(
                        meta.chip,
                        a.state.late && a.state.status === "waiting_on_us" &&
                          "bg-rose-50 text-rose-700",
                      )}
                    >
                      {meta.label}
                    </Badge>
                    {a.openFollowUps ? (
                      <p className="mt-1 text-[12px] text-muted">
                        {num(a.openFollowUps)} open
                        {a.overdueFollowUps ? (
                          <span className="font-semibold text-rose-700">
                            {" · "}
                            {num(a.overdueFollowUps)} late
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    {wf === null ? (
                      <>
                        <p className="text-[13px] italic text-muted">
                          {a.state.daysSinceLastMeeting === null
                            ? "Never met, nothing planned."
                            : a.state.status === "stalled"
                              ? `Nothing planned, and nobody there in ${num(a.state.daysSinceLastMeeting)} days.`
                              : "The last meeting closed without a next step."}
                        </p>
                        <Link
                          href={`/meetings/${a.accountId}`}
                          className="mt-1.5 inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[12.5px] font-semibold text-ink hover:bg-canvas"
                        >
                          Set next step
                          <ArrowRight size={13} />
                        </Link>
                      </>
                    ) : wf.kind === "follow_up" ? (
                      <>
                        <p className="text-[13px]">{wf.followUp.description}</p>
                        <p className="mt-1 text-[12px] text-muted">
                          {wf.followUp.side === "us"
                            ? wf.followUp.ownerName
                            : `${wf.followUp.ownerName} (customer)`}
                          {" · "}
                          <span
                            className={cn(
                              wf.daysLate > 0 && "font-semibold text-rose-700",
                            )}
                          >
                            {formatDateCompact(wf.followUp.dueOn)} ·{" "}
                            {dueLabel(wf.followUp.dueOn, today)}
                          </span>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[13px]">{wf.meeting.title}</p>
                        <p className="mt-1 text-[12px] text-muted">
                          {wf.meeting.ownerName} · planned{" "}
                          {formatDateCompact(wf.meeting.metOn)}
                          {wf.inDays >= 0
                            ? ` · in ${num(wf.inDays)} ${wf.inDays === 1 ? "day" : "days"}`
                            : ""}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 px-1 text-[12px] text-muted">
        {(
          ["waiting_on_us", "with_customer", "on_track", "no_next_step", "stalled"] as const
        ).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("h-2.5 w-2.5 rounded-full", STATUS_META[s].stripe)}
            />
            <dt className="font-semibold text-ink">{STATUS_META[s].label}</dt>
            <dd>{STATUS_META[s].explain}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 px-1 text-[12px] text-muted">
        Every status is worked out from the open follow-ups and their dates —
        nobody sets one by hand. Stalled means {STALE_DAYS} days with no meeting
        and nothing agreed.
      </p>
    </>
  );
}

function FollowUps({
  data,
  mine,
}: {
  data: Awaited<ReturnType<typeof listFollowUps>>;
  mine: boolean;
}) {
  const groups = bucketFollowUps(data.items, data.today);
  const overdue = data.items.filter((i) => i.dueOn < data.today).length;

  if (data.items.length === 0) {
    return (
      <EmptyState
        title={mine ? "Nothing open on you" : "Nothing open across the team"}
        body="Follow-ups appear here the moment somebody logs a meeting that commits to one."
      />
    );
  }

  return (
    <>
      {overdue ? (
        <p className="mb-3 rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13.5px] font-medium text-rose-800">
          {num(overdue)} {overdue === 1 ? "follow-up is" : "follow-ups are"} past
          their date.
        </p>
      ) : null}
      <div className="space-y-3">
        {groups.map((g) => (
          <Card key={g.bucket}>
            <CardHeader
              title={BUCKET_LABEL[g.bucket]}
              action={
                <span className="tabular text-[12px] text-muted">
                  {num(g.items.length)}
                </span>
              }
            />
            <div className="space-y-2 px-4 pb-4">
              {g.items.map((item) => (
                <FollowUpRow
                  key={item.id}
                  item={{
                    id: item.id,
                    description: item.description,
                    dueOn: item.dueOn,
                    status: "open",
                    side: item.side,
                    ownerName: item.ownerName,
                    accountId: item.accountId,
                    accountName: item.accountName,
                    meetingRef: item.meetingRef,
                    meetingLevel: item.meetingLevel,
                  }}
                  today={data.today}
                  showSource
                />
              ))}
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-3 px-1 text-[12px] text-muted">
        Ticking one closes it and the board updates. Dropping one asks why.
        {mine ? "" : " The team list shows only what we owe — what a customer owes us sits on their account."}
      </p>
    </>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="rounded-[14px] border border-line bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "tabular mt-1 text-[24px] font-bold leading-none tracking-[-0.03em]",
          tone === "bad" && "text-rose-700",
          tone === "warn" && "text-amber-800",
        )}
      >
        {value}
      </dd>
      <dd className="mt-1 text-[11.5px] text-muted">{sub}</dd>
    </div>
  );
}
