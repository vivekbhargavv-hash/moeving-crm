"use client";

import {
  BatteryCharging,
  Pencil,
  Plug,
  Repeat,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import type { MasterData } from "@/components/quick-add";
import { StageChanger, type StageTarget } from "@/components/stage-changer";
import {
  Button,
  ChoiceGroup,
  Field,
  Input,
  Select,
  Sheet,
  Textarea,
} from "@/components/ui";
import type { SalesStage } from "@/db/schema";
import { CHARGING_SCOPES, DRIVER_TYPES } from "@/lib/constants";
import { monthLabelShort, upcomingMonths } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { updateOpportunity } from "@/server/actions";

const DRIVER_ICONS: Record<string, React.ReactNode> = {
  driver_only: <User size={22} />,
  driver_plus_helper: <Users size={22} />,
  driver_cum_helper: <UserPlus size={22} />,
};

const CHARGING_ICONS: Record<string, React.ReactNode> = {
  client: <Plug size={22} />,
  moeving: <BatteryCharging size={22} />,
};

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
  notes: string | null;
  ownerUserId: string;
};

export function DetailActions({
  opp,
  master,
  role,
}: {
  opp: Editable;
  master: MasterData;
  role: "admin" | "sales";
}) {
  const router = useRouter();
  const [stageTarget, setStageTarget] = React.useState<StageTarget | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [driverType, setDriverType] = React.useState<string | null>(opp.driverType);
  const [chargingScope, setChargingScope] = React.useState<string | null>(
    opp.chargingScope,
  );
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
  }, [editing, opp]);

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateOpportunity(opp.id, formData);
        if (!result.ok) return setError(result.error);
        setEditing(false);
        router.refresh();
      } catch {
        setError("Could not save that. Check your connection and try again.");
      }
    });
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() =>
            setStageTarget({
              id: opp.id,
              name: opp.name,
              stage: opp.stage,
              value: opp.value,
              price: opp.price,
              fleetSize: opp.fleetSize,
            })
          }
        >
          <Repeat size={17} /> Move stage
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>
          <Pencil size={17} /> Edit
        </Button>
      </div>

      <StageChanger
        target={stageTarget}
        lostReasons={master.lostReasons}
        onClose={() => setStageTarget(null)}
      />

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
              <Select name="cityId" defaultValue={opp.cityId ?? ""}>
                <option value="">Select</option>
                {master.cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vehicle">
              <Select name="vehicleTypeId" defaultValue={opp.vehicleTypeId ?? ""}>
                <option value="">Select</option>
                {master.vehicleTypes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
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
            <Field label="Sales SPOC">
              <Select name="ownerUserId" defaultValue={opp.ownerUserId}>
                {master.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Notes">
            <Textarea name="notes" defaultValue={opp.notes ?? ""} />
          </Field>
          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
