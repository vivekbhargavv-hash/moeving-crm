import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DetailActions } from "@/components/opportunity/detail-actions";
import { ExpandDeal } from "@/components/opportunity/expand-deal";
import { NoteBox } from "@/components/opportunity/note-box";
import { UnitEconomics } from "@/components/opportunity/unit-economics";
import { Badge, Card, CardHeader } from "@/components/ui-server";
import {
  CHARGING_SCOPE_LABEL,
  DRIVER_TYPE_LABEL,
  STAGE_MAP,
} from "@/lib/constants";
import { cn, formatDate, inr, inrCompact, num } from "@/lib/utils";
import { requireSales } from "@/server/auth";
import { getMasterData, getOpportunity } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, row, master] = await Promise.all([
    requireSales(),
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

      <div className="mb-3 overflow-hidden rounded-2xl border border-line bg-white">
        <span className={cn("block h-1", stage.dot)} aria-hidden="true" />
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <Badge className={cn("px-2.5 py-1 text-[12px]", stage.chip)}>
              {stage.label}
            </Badge>
            <h1 className="mt-2 truncate text-[22px] font-bold tracking-[-0.02em]">
              {row.accountName}
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-muted">
              {row.city ?? "No city"} · {row.ownerName}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tabular text-[22px] font-bold leading-none">
              {inrCompact(value)}
            </p>
            <p className="mt-1 text-[11px] text-muted">per month</p>
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
          operatingDays: opp.operatingDays,
          expectedCloseDate: opp.expectedCloseDate,
          notes: opp.notes,
          ownerUserId: opp.ownerUserId,
        }}
        master={master}
        role={session.role}
        // Owner or admin for anything open; a recorded win is admin-only,
        // since deleting it restates a month that has already been reported.
        canDelete={
          (session.role === "admin" ||
            opp.ownerUserId === session.userId) &&
          (session.role === "admin" || opp.stage !== "closed_won")
        }
        expansionCount={row.expansions.length}
      />

      {/* Repeat business. A won customer coming back for more trucks gets a
          new deal carrying this one's setup — never an edit to this row, whose
          close date is the month the wins report counts it in. */}
      {isWon ? (
        <div className="mt-3">
          <ExpandDeal
            cities={master.cities}
            source={{
              id: opp.id,
              accountName: row.accountName,
              cityId: opp.cityId,
              cityName: row.city,
              vehicleType: row.vehicleType,
              driverTypeLabel: opp.driverType
                ? DRIVER_TYPE_LABEL[opp.driverType]!
                : null,
              chargingScopeLabel: opp.chargingScope
                ? CHARGING_SCOPE_LABEL[opp.chargingScope]!
                : null,
              revenue: opp.revenue,
              costPerVehicle: opp.costPerVehicle,
              marginPerVehicle: opp.marginPerVehicle,
              marginPct: opp.marginPct === null ? null : Number(opp.marginPct),
            }}
          />
        </div>
      ) : null}

      {row.parent || row.expansions.length ? (
        <Card className="mt-3">
          <CardHeader title="This customer's deployments" />
          <ul className="divide-y divide-line px-4 pb-1">
            {row.parent ? (
              <li className="py-2.5">
                <Link
                  href={`/opportunities/${row.parent.id}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Badge className="bg-slate-100 text-slate-600">Grew out of</Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {row.parent.name}
                  </span>
                  <span className="tabular shrink-0 text-[13px] text-muted">
                    {num(row.parent.fleetSize)} veh
                  </span>
                </Link>
              </li>
            ) : null}
            {row.expansions.map((e) => (
              <li key={e.id} className="py-2.5">
                <Link
                  href={`/opportunities/${e.id}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Badge className={cn(STAGE_MAP[e.stage].chip)}>
                    {STAGE_MAP[e.stage].short}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
                  <span className="tabular shrink-0 text-[13px] text-muted">
                    {num(e.fleetSize)} veh
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-4 pt-1 text-[13px] text-muted">
            Each deployment is its own deal, so each one closes in its own month
            and carries its own cost sheet.
          </p>
        </Card>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader title="Deal" />
          <dl className="px-4 pb-4 text-sm">
            {opp.name !== row.accountName ? (
              <Row label="Deal name" value={opp.name} />
            ) : null}
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
            <Row
              label="Operating days"
              value={opp.operatingDays ? `${opp.operatingDays} a month` : "—"}
            />
            <Row label="Fleet size" value={num(opp.fleetSize)} />
            <Row label="Monthly value" value={inr(value)} strong />
          </dl>
        </Card>

        {/* Shown at every stage, not only once won: costing happens while the
            deal is being quoted, and Closed Won is where it is checked. */}
        <UnitEconomics
          id={opp.id}
          fleetSize={opp.fleetSize}
          price={opp.price}
          isWon={isWon}
          sheet={{
            revenue: opp.revenue,
            leaseCost: opp.leaseCost,
            driverCost: opp.driverCost,
            chargingCost: opp.chargingCost,
            parkingCost: opp.parkingCost,
            maintenanceCost: opp.maintenanceCost,
            supervisorCost: opp.supervisorCost,
            miscCost: opp.miscCost,
          }}
        />

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
