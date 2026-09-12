"use client";

import { Pencil, Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import type { MasterData } from "@/components/quick-add";
import { StageChanger, type StageTarget } from "@/components/stage-changer";
import { Button, Field, Input, Select, Sheet, Textarea } from "@/components/ui";
import type { SalesStage } from "@/db/schema";
import { CHARGING_SCOPES, DRIVER_TYPES } from "@/lib/constants";
import { updateOpportunity } from "@/server/actions";

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
  const formRef = React.useRef<HTMLFormElement>(null);

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOpportunity(opp.id, formData);
      if (!result.ok) return setError(result.error);
      setEditing(false);
      router.refresh();
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
        footer={
          <Button
            variant="brand"
            size="lg"
            className="w-full"
            disabled={pending}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        }
      >
        <form ref={formRef} action={save} className="space-y-4">
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
            <Field label="Driver type">
              <Select name="driverType" defaultValue={opp.driverType ?? ""}>
                <option value="">Select</option>
                {DRIVER_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Charging">
              <Select name="chargingScope" defaultValue={opp.chargingScope ?? ""}>
                <option value="">Select</option>
                {CHARGING_SCOPES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
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
          <Field label="Expected closing">
            <Input
              type="date"
              name="expectedCloseDate"
              defaultValue={opp.expectedCloseDate ?? ""}
            />
          </Field>
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
        </form>
      </Sheet>
    </>
  );
}
