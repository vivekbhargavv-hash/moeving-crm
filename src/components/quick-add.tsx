"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import {
  Button,
  Field,
  Input,
  Select,
  Sheet,
  Textarea,
} from "@/components/ui";
import { CHARGING_SCOPES, DRIVER_TYPES } from "@/lib/constants";
import { cn, inrCompact } from "@/lib/utils";
import { createOpportunity } from "@/server/actions";
import type { Session } from "@/server/auth";

export type MasterData = {
  cities: { id: string; name: string }[];
  vehicleTypes: { id: string; name: string }[];
  lostReasons: { id: string; label: string }[];
  users: { id: string; name: string; role: string }[];
  accounts: { id: string; name: string }[];
};

const PREFS_KEY = "moeving:last-used";

type Prefs = {
  cityId?: string;
  vehicleTypeId?: string;
  driverType?: string;
  chargingScope?: string;
};

function readPrefs(): Prefs {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs;
  } catch {
    return {};
  }
}

/** dd of the last day of the month `offset` months from now, as YYYY-MM-DD. */
function monthEnd(offset: number) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return d.toISOString().slice(0, 10);
}

export function QuickAdd({
  open,
  onClose,
  master,
  session,
}: {
  open: boolean;
  onClose: () => void;
  master: MasterData;
  session: Session;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [prefs, setPrefs] = React.useState<Prefs>({});
  const [fleet, setFleet] = React.useState(5);
  const [price, setPrice] = React.useState("");
  const [closeDate, setCloseDate] = React.useState(monthEnd(1));
  const [showMore, setShowMore] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (open) {
      setPrefs(readPrefs());
      setError(null);
      setFleet(5);
      setPrice("");
      setCloseDate(monthEnd(1));
      setShowMore(false);
    }
  }, [open]);

  const value = Number(price || 0) * fleet;

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createOpportunity(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        localStorage.setItem(
          PREFS_KEY,
          JSON.stringify({
            cityId: formData.get("cityId"),
            vehicleTypeId: formData.get("vehicleTypeId"),
            driverType: formData.get("driverType"),
            chargingScope: formData.get("chargingScope"),
          }),
        );
      } catch {
        /* private mode — defaults just won't stick */
      }
      onClose();
      router.push(`/opportunities/${result.data!.id}`);
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New deal"
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm">
            <span className="text-muted">Monthly value </span>
            <span className="font-semibold tabular">
              {value ? inrCompact(value) : "—"}
            </span>
          </div>
          <Button
            variant="brand"
            size="lg"
            disabled={pending}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {pending ? "Saving…" : "Create deal"}
          </Button>
        </div>
      }
    >
      <form ref={formRef} action={submit} className="space-y-4">
        <Field label="Customer">
          <Input
            name="accountName"
            list="account-options"
            required
            autoFocus
            autoComplete="off"
            placeholder="e.g. Berger Paints"
            enterKeyHint="next"
          />
          <datalist id="account-options">
            {master.accounts.map((a) => (
              <option key={a.id} value={a.name} />
            ))}
          </datalist>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <Select name="cityId" defaultValue={prefs.cityId ?? ""}>
              <option value="">Select</option>
              {master.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vehicle">
            <Select name="vehicleTypeId" defaultValue={prefs.vehicleTypeId ?? ""}>
              <option value="">Select</option>
              {master.vehicleTypes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fleet size">
            <div className="flex h-12 items-center rounded-xl border border-line bg-white">
              <button
                type="button"
                onClick={() => setFleet((f) => Math.max(1, f - 1))}
                className="h-full w-12 text-xl text-muted active:bg-canvas rounded-l-xl"
                aria-label="Decrease fleet size"
              >
                −
              </button>
              <input
                name="fleetSize"
                inputMode="numeric"
                value={fleet}
                onChange={(e) =>
                  setFleet(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))
                }
                className="w-full border-0 bg-transparent text-center text-lg font-semibold tabular focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setFleet((f) => f + 1)}
                className="h-full w-12 text-xl text-muted active:bg-canvas rounded-r-xl"
                aria-label="Increase fleet size"
              >
                +
              </button>
            </div>
          </Field>
          <Field label="Price / vehicle / month">
            <Input
              name="price"
              inputMode="numeric"
              placeholder="₹"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>

        <Field label="Expected closing">
          <div className="mb-2 flex gap-2">
            {[0, 1, 2].map((offset) => {
              const date = monthEnd(offset);
              const label = new Date(date).toLocaleDateString("en-IN", {
                month: "short",
                timeZone: "UTC",
              });
              return (
                <button
                  key={offset}
                  type="button"
                  onClick={() => setCloseDate(date)}
                  className={cn(
                    "h-10 flex-1 rounded-xl border text-sm font-medium transition",
                    closeDate === date
                      ? "border-brand bg-brand-soft text-brand-ink"
                      : "border-line text-muted",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <Input
            type="date"
            name="expectedCloseDate"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </Field>

        {showMore ? (
          <div className="space-y-4 border-t border-line pt-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Driver type">
                <Select name="driverType" defaultValue={prefs.driverType ?? ""}>
                  <option value="">Select</option>
                  {DRIVER_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Charging">
                <Select name="chargingScope" defaultValue={prefs.chargingScope ?? ""}>
                  <option value="">Select</option>
                  {CHARGING_SCOPES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Deal name" hint="Defaults to the customer name.">
              <Input name="name" placeholder="Optional" />
            </Field>
            {session.role === "admin" ? (
              <Field label="Sales SPOC">
                <Select name="ownerUserId" defaultValue={session.userId}>
                  {master.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Notes">
              <Textarea name="notes" placeholder="What did they ask for?" />
            </Field>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="text-sm font-medium text-brand-ink"
          >
            + Driver, charging, notes
          </button>
        )}

        <p className="text-xs text-muted">
          Saved as <span className="font-medium">First Contact</span>, owned by{" "}
          <span className="font-medium">{session.name}</span>.
        </p>

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
