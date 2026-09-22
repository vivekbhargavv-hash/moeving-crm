"use client";

import { Pencil, Repeat, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { CHARGING_ICONS, DRIVER_ICONS } from "@/components/choice-icons";
import type { MasterData } from "@/components/quick-add";
import { StageChanger, type StageTarget } from "@/components/stage-changer";
import {
  Button,
  ChoiceGroup,
  Field,
  Input,
  PickedDate,
  PickerField,
  Sheet,
  Textarea,
} from "@/components/ui";
import type { SalesStage } from "@/db/schema";
import type { UserRole } from "@/server/auth";
import { CHARGING_SCOPES, DRIVER_TYPES, OPERATING_DAYS } from "@/lib/constants";
import { showToast } from "@/lib/toast";
import { monthLabelShort, upcomingMonths } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { deleteOpportunity, updateOpportunity } from "@/server/actions";


type Editable = {
  id: string;
  name: string;
  stage: SalesStage;
  value: number;
  accountName: string;
  dealName: string;
  cityId: string | null;
  vehicleTypeId: string | null;
  driverType: string | null;
  chargingScope: string | null;
  fleetSize: number;
  price: number | null;
  expectedCloseDate: string | null;
  /** Pencilled in at Contracting, committed at Closed Won. */
  deploymentDate: string | null;
  operatingDays: number | null;
  notes: string | null;
  ownerUserId: string;
};

export function DetailActions({
  opp,
  master,
  role,
  canDelete,
  expansionCount,
}: {
  opp: Editable;
  master: MasterData;
  role: UserRole;
  /** False when this is a recorded win and the viewer is not an admin. */
  canDelete: boolean;
  /** Follow-on deployments, which survive but lose their link. */
  expansionCount: number;
}) {
  const router = useRouter();
  const [stageTarget, setStageTarget] = React.useState<StageTarget | null>(null);
  /**
   * The day the trucks are due.
   *
   * Editable here as well as on the stage sheets, because the stage sheets
   * only appear while you are MOVING a deal — a deal that is already sitting
   * in Contracting had no way to record one, which is exactly the hole Vivek
   * fell into.
   */
  const [deployDate, setDeployDate] = React.useState(opp.deploymentDate ?? "");
  const [editing, setEditing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [driverType, setDriverType] = React.useState<string | null>(opp.driverType);
  const [chargingScope, setChargingScope] = React.useState<string | null>(
    opp.chargingScope,
  );
  const [days, setDays] = React.useState<number | null>(opp.operatingDays);
  const [month, setMonth] = React.useState(
    opp.expectedCloseDate ? opp.expectedCloseDate.slice(0, 7) : "",
  );

  // The deal's own month stays offered even once it is in the past.
  const months = React.useMemo(() => {
    const list = upcomingMonths(6);
    return month && !list.includes(month) ? [month, ...list] : list;
  }, [month]);

  React.useEffect(() => {
    if (!editing) return;
    setDriverType(opp.driverType);
    setChargingScope(opp.chargingScope);
    setMonth(opp.expectedCloseDate ? opp.expectedCloseDate.slice(0, 7) : "");
    setDays(opp.operatingDays);
    setDeployDate(opp.deploymentDate ?? "");
  }, [editing, opp]);

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateOpportunity(opp.id, formData);
        if (!result.ok) return setError(result.error);
        showToast("Changes saved");
        setEditing(false);
      } catch {
        setError("Could not save that. Check your connection and try again.");
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteOpportunity(opp.id);
        if (!result.ok) return setError(result.error);
        setConfirmDelete(false);
        router.refresh();
        router.push("/pipeline");
      } catch {
        setError("Could not delete that. Check your connection and try again.");
      }
    });
  }

  const isWon = opp.stage === "closed_won";

  return (
    <>
      <div className="flex gap-2">
        <Button
          size="lg"
          variant="brand"
          className="flex-1"
          onClick={() =>
            setStageTarget({
              id: opp.id,
              name: opp.name,
              stage: opp.stage,
              value: opp.value,
              price: opp.price,
              fleetSize: opp.fleetSize,
              deploymentDate: opp.deploymentDate,
            })
          }
        >
          <Repeat size={17} /> Move stage
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="flex-1"
          onClick={() => setEditing(true)}
        >
          <Pencil size={17} /> Edit
        </Button>
      </div>

      {/* Delete sits apart from Move stage and Edit, and reads as plain text
          rather than a button: it is rare, and it is not undoable. */}
      {canDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-medium text-muted hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 size={15} /> Delete this deal
        </button>
      ) : null}

      <StageChanger
        target={stageTarget}
        lostReasons={master.lostReasons}
        onClose={() => setStageTarget(null)}
      />

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this deal"
      >
        <p className="text-sm">
          Permanently delete <strong>{opp.accountName}</strong>
          {opp.dealName && opp.dealName !== opp.accountName
            ? ` — ${opp.dealName}`
            : ""}
          ? This cannot be undone.
        </p>
        {isWon ? (
          <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
            This is a recorded win. Deleting it removes its revenue and margin
            from the month it closed in, so the Forecast and Wins numbers you
            have already reported will change.
          </p>
        ) : null}
        {expansionCount > 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            {expansionCount} follow-on{" "}
            {expansionCount === 1 ? "deployment" : "deployments"} grew out of
            this deal. {expansionCount === 1 ? "It stays" : "They stay"} in the
            pipeline, but the link back to this one is lost.
          </p>
        ) : null}
        {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 bg-rose-600 text-white hover:bg-rose-700"
            disabled={pending}
            onClick={remove}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit deal"
        action={save}
        footer={
          <Button variant="brand" size="lg" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Customer">
            <Input name="accountName" required defaultValue={opp.accountName} />
          </Field>
          <Field label="Opportunity name">
            <Input name="name" defaultValue={opp.dealName} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <PickerField
                label="City"
                name="cityId"
                defaultValue={opp.cityId ?? ""}
                options={master.cities.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Field>
            <Field label="Vehicle">
              <PickerField
                label="Vehicle"
                name="vehicleTypeId"
                defaultValue={opp.vehicleTypeId ?? ""}
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
                defaultValue={opp.fleetSize}
              />
            </Field>
            <Field label="Price / vehicle / mo">
              <Input
                name="price"
                inputMode="numeric"
                defaultValue={opp.price ?? ""}
              />
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
                    <span className="text-[11px] font-normal opacity-70">
                      {d.hint}
                    </span>
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="operatingDays" value={days ?? ""} />
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
              Driver type
            </p>
            <ChoiceGroup
              name="driverType"
              value={driverType}
              onChange={setDriverType}
              options={DRIVER_TYPES.map((d) => ({
                value: d.value,
                label: d.label,
                icon: DRIVER_ICONS[d.value],
              }))}
            />
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
              Charging scope
            </p>
            <ChoiceGroup
              name="chargingScope"
              columns={2}
              value={chargingScope}
              onChange={setChargingScope}
              options={CHARGING_SCOPES.map((c) => ({
                value: c.value,
                label: `${c.label} scope`,
                icon: CHARGING_ICONS[c.value],
              }))}
            />
          </div>

          <Field
            label="Expected deployment date"
            hint={
              opp.stage === "closed_won"
                ? "Ops is planning against this. Changing it moves a commitment."
                : "When the vehicles are due on the road. Optional until the deal is won."
            }
          >
            <Input
              type="date"
              name="deploymentDate"
              value={deployDate}
              onChange={(e) => setDeployDate(e.target.value)}
            />
            <PickedDate value={deployDate} />
          </Field>

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
          {role === "admin" ? (
            <Field label="Deal Owner">
              <PickerField
                label="Deal owner"
                name="ownerUserId"
                defaultValue={opp.ownerUserId}
                options={master.users.map((u) => ({
                  value: u.id,
                  label: u.name,
                }))}
              />
            </Field>
          ) : null}
          <Field label="Notes">
            <Textarea name="notes" defaultValue={opp.notes ?? ""} />
          </Field>
          {error ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
