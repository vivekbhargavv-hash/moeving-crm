"use client";

import { Check, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import {
  Button,
  ChoiceGroup,
  Field,
  Input,
  Select,
  Sheet,
  Textarea,
} from "@/components/ui";
import { CHARGING_ICONS, DRIVER_ICONS } from "@/components/choice-icons";
import { CHARGING_SCOPES, DRIVER_TYPES } from "@/lib/constants";
import {
  cn,
  inrCompact,
  monthLabelLong,
  monthLabelShort,
  upcomingMonths,
} from "@/lib/utils";
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
  cityIds?: string[];
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


/**
 * Repeat business: the same customer asking for more trucks.
 *
 * The follow-on is a NEW deal carrying the original's setup, never an edit to
 * the won one — a won deal that grows would move a recorded win out of the
 * month it actually happened in and quietly restate the wins report.
 */
export type Prefill = {
  parentOpportunityId: string;
  parentLabel: string;
  accountName: string;
  cityIds: string[];
  vehicleTypeId: string;
  driverType: string | null;
  chargingScope: string | null;
  price: string;
};

export function QuickAdd({
  open,
  onClose,
  master,
  session,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  master: MasterData;
  session: Session;
  prefill?: Prefill;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [cityIds, setCityIds] = React.useState<string[]>([]);
  const [vehicleTypeId, setVehicleTypeId] = React.useState("");
  const [driverType, setDriverType] = React.useState<string | null>(null);
  const [chargingScope, setChargingScope] = React.useState<string | null>(null);
  const [fleet, setFleet] = React.useState(5);
  const [price, setPrice] = React.useState("");
  const [month, setMonth] = React.useState(() => upcomingMonths(1)[0]!);
  const [showMore, setShowMore] = React.useState(false);

  const months = React.useMemo(() => upcomingMonths(6), []);

  React.useEffect(() => {
    if (!open) return;
    // An expansion starts from the deal it grew out of; anything else starts
    // from what this person last used.
    const prefs = prefill ?? readPrefs();
    setError(null);
    setCityIds(prefs.cityIds ?? []);
    setVehicleTypeId(prefs.vehicleTypeId ?? "");
    setDriverType(prefs.driverType ?? null);
    setChargingScope(prefs.chargingScope ?? null);
    setFleet(5);
    setPrice(prefill?.price ?? "");
    setMonth(upcomingMonths(1)[0]!);
    setShowMore(false);
  }, [open, prefill]);

  const perDeal = Number(price || 0) * fleet;
  const dealCount = Math.max(1, cityIds.length);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createOpportunity(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        try {
          // An expansion copies one customer's existing setup; it is not this
          // person's new habit, so it does not become their default.
          if (!prefill) {
            localStorage.setItem(
              PREFS_KEY,
              JSON.stringify({ cityIds, vehicleTypeId, driverType, chargingScope }),
            );
          }
        } catch {
          /* private mode — defaults just won't stick */
        }
        const { id, count } = result.data!;
        onClose();
        router.refresh();
        // One deal opens directly; several go back to the pipeline, where
        // seeing the new cards is the point.
        router.push(
          count > 1 ? `/pipeline?created=${count}` : `/opportunities/${id}`,
        );
      } catch {
        setError("Could not save that. Check your connection and try again.");
      }
    });
  }

  function toggleCity(id: string) {
    setCityIds((ids) =>
      ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id],
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={prefill ? "Deploy more vehicles" : "New deal"}
      action={submit}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm">
            <span className="text-muted">
              {dealCount > 1 ? `${dealCount} deals · ` : "Monthly value "}
            </span>
            <span className="tabular font-semibold">
              {perDeal ? inrCompact(perDeal) : "—"}
            </span>
            {dealCount > 1 ? <span className="text-muted"> each</span> : null}
          </div>
          <Button variant="brand" size="lg" disabled={pending}>
            {pending
              ? "Saving…"
              : dealCount > 1
                ? `Create ${dealCount} deals`
                : "Create deal"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {prefill ? (
          <>
            <input
              type="hidden"
              name="parentOpportunityId"
              value={prefill.parentOpportunityId}
            />
            <p className="rounded-xl bg-brand-soft px-4 py-3 text-[13px] text-brand-ink">
              A new deal for <strong>{prefill.accountName}</strong>, carrying the
              setup from {prefill.parentLabel}. The won deal is left exactly as
              it is, so the month it closed in still counts.
            </p>
          </>
        ) : null}
        <Field label="Customer">
          <Input
            name="accountName"
            list="account-options"
            required
            autoFocus={!prefill}
            readOnly={Boolean(prefill)}
            defaultValue={prefill?.accountName ?? ""}
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

        <div>
          <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
            City
            <span className="ml-1 font-normal">
              — pick more than one for a deal per city
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {master.cities.map((c) => {
              const on = cityIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCity(c.id)}
                  className={cn(
                    "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition active:scale-[0.98]",
                    on
                      ? "border-brand bg-brand-soft text-brand-ink"
                      : "border-line bg-white text-muted",
                  )}
                >
                  {on ? <Check size={15} /> : null}
                  {c.name}
                </button>
              );
            })}
          </div>
          {cityIds.map((id) => (
            <input key={id} type="hidden" name="cityIds" value={id} />
          ))}
        </div>

        <Field label="Vehicle">
          <Select
            name="vehicleTypeId"
            value={vehicleTypeId}
            onChange={(e) => setVehicleTypeId(e.target.value)}
          >
            <option value="">Select</option>
            {master.vehicleTypes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fleet size">
            <div className="flex h-12 items-center rounded-xl border border-line bg-white">
              <button
                type="button"
                onClick={() => setFleet((f) => Math.max(1, f - 1))}
                className="h-full w-12 rounded-l-xl text-xl text-muted active:bg-canvas"
                aria-label="Decrease fleet size"
              >
                −
              </button>
              <input
                name="fleetSize"
                inputMode="numeric"
                aria-label="Fleet size"
                value={fleet}
                onChange={(e) =>
                  setFleet(
                    Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1),
                  )
                }
                className="tabular w-full border-0 bg-transparent text-center text-lg font-semibold focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setFleet((f) => f + 1)}
                className="h-full w-12 rounded-r-xl text-xl text-muted active:bg-canvas"
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

        {showMore ? (
          <div className="space-y-4 border-t border-line pt-4">
            <Field label="Deal name" hint="Defaults to the customer name.">
              <Input name="name" placeholder="Optional" />
            </Field>
            {session.role === "admin" ? (
              <Field label="Deal Owner">
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
            + Deal name, notes
          </button>
        )}

        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          <Truck size={13} />
          Saved as <span className="font-medium">First Contact</span>, owned by{" "}
          <span className="font-medium">{session.name}</span>, closing end of{" "}
          <span className="font-medium">{monthLabelLong(month)}</span>.
        </p>

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
