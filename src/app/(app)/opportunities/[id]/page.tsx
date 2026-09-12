import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DetailActions } from "@/components/opportunity/detail-actions";
import { NoteBox } from "@/components/opportunity/note-box";
import { Badge, Card, CardHeader } from "@/components/ui-server";
import {
  CHARGING_SCOPE_LABEL,
  COST_FIELDS,
  DRIVER_TYPE_LABEL,
  STAGE_MAP,
} from "@/lib/constants";
import { cn, formatDate, inr, inrCompact, num } from "@/lib/utils";
import { requireSession } from "@/server/auth";
import { getMasterData, getOpportunity } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, row, master] = await Promise.all([
    requireSession(),
    getOpportunity(id),
    getMasterData(),
  ]);
  if (!row) notFound();

  const { opp } = row;
  const stage = STAGE_MAP[opp.stage];
  const value = (opp.price ?? 0) * opp.fleetSize;
  const isWon = opp.stage === "closed_won";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/pipeline"
        className="mb-2 inline-flex h-9 items-center gap-1 pr-3 text-[15px] font-medium text-brand-ink active:opacity-70"
      >
        <ArrowLeft size={18} /> Pipeline
      </Link>

      <div className={cn("mb-3 rounded-2xl border p-4", stage.chip, "border-transparent")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge className="bg-white/70 px-2.5 py-1 text-[12px]">
              {stage.label}
            </Badge>
            <h1 className="mt-2 truncate text-[22px] font-bold tracking-[-0.02em]">
              {row.accountName}
            </h1>
            <p className="mt-0.5 truncate text-[13px] opacity-80">
              {row.city ?? "No city"} · {row.ownerName}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tabular text-[22px] font-bold leading-none">
              {inrCompact(value)}
            </p>
            <p className="mt-1 text-[11px] opacity-70">per month</p>
          </div>
        </div>
      </div>

      <DetailActions
        opp={{
          id: opp.id,
          name: row.accountName,
          stage: opp.stage,
          value,
          accountName: row.accountName,
          dealName: opp.name,
          cityId: opp.cityId,
          vehicleTypeId: opp.vehicleTypeId,
          driverType: opp.driverType,
          chargingScope: opp.chargingScope,
          fleetSize: opp.fleetSize,
          price: opp.price,
          expectedCloseDate: opp.expectedCloseDate,
          notes: opp.notes,
          ownerUserId: opp.ownerUserId,
        }}
        master={master}
        role={session.role}
      />

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader title="Deal" />
          <dl className="px-4 pb-4 text-sm">
            <Row label="Customer" value={row.accountName} />
            <Row label="Opportunity" value={opp.name} />
            <Row label="City" value={row.city ?? "—"} />
            <Row label="Deal Owner" value={row.ownerName} />
            <Row
              label="Expected closing"
              value={formatDate(opp.expectedCloseDate)}
            />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Vehicle & operations" />
          <dl className="px-4 pb-4 text-sm">
            <Row label="Vehicle type" value={row.vehicleType ?? "—"} />
            <Row label="Fleet size" value={`${num(opp.fleetSize)} vehicles`} />
            <Row
              label="Driver type"
              value={opp.driverType ? DRIVER_TYPE_LABEL[opp.driverType]! : "—"}
            />
            <Row
              label="Charging scope"
              value={
                opp.chargingScope ? CHARGING_SCOPE_LABEL[opp.chargingScope]! : "—"
              }
            />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Commercials" />
          <dl className="px-4 pb-4 text-sm">
            <Row label="Price / vehicle / month" value={inr(opp.price)} />
            <Row label="Fleet size" value={num(opp.fleetSize)} />
            <Row label="Monthly value" value={inr(value)} strong />
          </dl>
        </Card>

        {isWon ? (
          <Card>
            <CardHeader title="Unit economics — per vehicle / month" />
            <dl className="px-4 pb-4 text-sm">
              <Row label="Revenue" value={inr(opp.revenue)} />
              {COST_FIELDS.map((f) => (
                <Row
                  key={f.key}
                  label={f.label}
                  value={inr(opp[f.key] as number | null)}
                  muted
                />
              ))}
              <Row label="Cost per vehicle" value={inr(opp.costPerVehicle)} />
              <Row
                label="Margin per vehicle"
                value={inr(opp.marginPerVehicle)}
                strong
              />
              <Row
                label="Margin %"
                value={
                  opp.marginPct === null
                    ? "—"
                    : `${Number(opp.marginPct).toFixed(1)}%`
                }
                strong
                tone={
                  opp.marginPct !== null && Number(opp.marginPct) < 0
                    ? "text-rose-700"
                    : "text-emerald-700"
                }
              />
            </dl>
          </Card>
        ) : null}

        {isWon ? (
          <Card>
            <CardHeader title={`Whole deal — ${num(opp.fleetSize)} vehicles`} />
            <dl className="px-4 pb-4 text-sm">
              <Row label="Revenue / month" value={inr(opp.totalRevenue)} />
              <Row label="Total cost / month" value={inr(opp.totalCost)} />
              <Row
                label="Gross margin / month"
                value={inr(opp.grossMargin)}
                strong
                tone={
                  (opp.grossMargin ?? 0) < 0 ? "text-rose-700" : "text-emerald-700"
                }
              />
              <Row
                label="Gross margin / year"
                value={inr((opp.grossMargin ?? 0) * 12)}
              />
            </dl>
          </Card>
        ) : null}

        {opp.stage === "closed_lost" ? (
          <Card>
            <CardHeader title="Why we lost" />
            <div className="px-4 pb-4 text-sm">
              <p className="font-medium">{row.lostReason ?? "—"}</p>
              {opp.lostReasonNote ? (
                <p className="mt-1 text-muted">{opp.lostReasonNote}</p>
              ) : null}
            </div>
          </Card>
        ) : null}

        <Card className="md:col-span-2">
          <CardHeader title="Notes & activity" />
          <div className="px-4 pb-4">
            {opp.notes ? (
              <p className="mb-3 whitespace-pre-wrap rounded-xl bg-canvas p-3 text-sm">
                {opp.notes}
              </p>
            ) : null}
            <NoteBox opportunityId={opp.id} />
            <ul className="mt-4 space-y-3">
              {row.events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
                  <div className="min-w-0">
                    <p>
                      {e.kind === "stage_changed" ? (
                        <>
                          Moved to{" "}
                          <span className="font-medium">
                            {e.toStage ? STAGE_MAP[e.toStage].label : "—"}
                          </span>
                        </>
                      ) : e.kind === "note" ? (
                        <span className="whitespace-pre-wrap">{e.body}</span>
                      ) : e.kind === "created" ? (
                        "Deal created"
                      ) : (
                        "Details updated"
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {e.userName ?? "Someone"} ·{" "}
                      {new Date(e.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0",
        muted && "text-muted",
      )}
    >
      <dt className={cn(!muted && "text-muted")}>{label}</dt>
      <dd
        className={cn(
          "tabular truncate text-right",
          strong ? "font-semibold" : "font-medium",
          tone,
        )}
      >
        {value}
      </dd>
    </div>
  );
}
