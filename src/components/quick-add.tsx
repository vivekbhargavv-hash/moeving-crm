"use client";

import { Check, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import {
  Button,
  ChoiceGroup,
  Field,
  Input,
  Picker,
  PickerField,
  Sheet,
  Textarea,
} from "@/components/ui";
import { CHARGING_ICONS, DRIVER_ICONS } from "@/components/choice-icons";
import { Shimmer } from "@/components/skeletons";
import { CHARGING_SCOPES, DRIVER_TYPES, OPERATING_DAYS } from "@/lib/constants";
import { showToast } from "@/lib/toast";
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
};

/**
 * Master data plus the customer list, which only this sheet reads and which
 * the shell therefore fetches when the sheet is first opened rather than on
 * every page view.
 */
export type QuickAddData = MasterData & {
  accounts: { id: string; name: string }[];
};

/**
 * The sheet opens empty. It used to remember the last city, vehicle type,
 * driver type and charging scope this person used, and to pre-tick a fleet of
 * 5 and the current month — which meant a deal saved with whatever was already
 * highlighted if nobody looked. Every field is now a deliberate choice, and the
 * only pre-filled sheet is an expansion, which copies the deal it grew from.
 */

export function QuickAdd({
  open,
  onClose,
  master,
  session,
}: {
  open: boolean;
  onClose: () => void;
  master: QuickAddData | null;
  session: Session;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [cityIds, setCityIds] = React.useState<string[]>([]);
  const [vehicleTypeId, setVehicleTypeId] = React.useState("");
  const [driverType, setDriverType] = React.useState<string | null>(null);
  const [chargingScope, setChargingScope] = React.useState<string | null>(null);
  // Fleet is a string, not a number, so the field can genuinely be blank
  // rather than showing a 1 nobody chose.
  const [fleet, setFleet] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [days, setDays] = React.useState<number | null>(null);
  const [month, setMonth] = React.useState("");
  const [showMore, setShowMore] = React.useState(false);
  // Anything typed into a text field — the customer, the name, the notes —
  // which the state above does not hold.
  const [typed, setTyped] = React.useState(false);
  const [customer, setCustomer] = React.useState("");
  // The deal name writes itself — "Customer - City" — until somebody types
  // their own ("Flipkart - GGN"), after which it is theirs and stays put.
  const [dealName, setDealName] = React.useState("");
  const [nameTyped, setNameTyped] = React.useState(false);

  const months = React.useMemo(() => upcomingMonths(6), []);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setCityIds([]);
    setVehicleTypeId("");
    setDriverType(null);
    setChargingScope(null);
    setFleet("");
    setPrice("");
    setDays(null);
    setMonth("");
    setShowMore(false);
    setTyped(false);
    setCustomer("");
    setDealName("");
    setNameTyped(false);
  }, [open]);

  // Several cities make several deals, and the server adds each one's city to
  // this name — so the suggestion is then the customer alone.
  const cityName =
    cityIds.length === 1
      ? master?.cities.find((c) => c.id === cityIds[0])?.name
      : undefined;
  const suggestedName = [customer.trim(), cityName].filter(Boolean).join(" - ");
  React.useEffect(() => {
    if (!nameTyped) setDealName(suggestedName);
  }, [suggestedName, nameTyped]);

  const fleetCount = Number(fleet || 0);
  const perDeal = Number(price || 0) * fleetCount;
  const dealCount = Math.max(1, cityIds.length);
  const dirty = Boolean(
    typed ||
      cityIds.length ||
      vehicleTypeId ||
      driverType ||
      chargingScope ||
      fleet ||
      price ||
      days ||
      month,
  );

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createOpportunity(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const { id, count } = result.data!;
        // Several deals are confirmed on the Pipeline, by ?created=N.
        if (count === 1) showToast("Deal created");
        onClose();
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

  // The sheet's own data arrives on first open. Until it does the frame is
  // here, the right size, rather than a sheet that refuses to open.
  if (!master) {
    return (
      <Sheet open={open} onClose={onClose} title="New deal">
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <Shimmer className="h-3 w-24" />
              <Shimmer className="mt-2 h-12 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New deal"
      action={submit}
      confirmDiscard={dirty && !pending}
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
      <div className="space-y-4" onInput={() => setTyped(true)}>
        <Field label="Customer">
          <Input
            name="accountName"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
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

        {/* Filled in from the customer and city; required, because "Flipkart"
            alone does not say which of three Flipkart deals this is. */}
        <Field
          label="Deal name"
          hint={
            cityIds.length > 1
              ? "Each city's deal gets its city added to this name."
              : nameTyped
                ? undefined
                : "Filled in from the customer and city. Change it if you like."
          }
        >
          <Input
            name="name"
            required
            value={dealName}
            onChange={(e) => {
              setDealName(e.target.value);
              // Clearing the box hands it back to the suggestion.
              setNameTyped(e.target.value.trim() !== "");
            }}
            autoComplete="off"
            placeholder="Customer - City"
            enterKeyHint="next"
          />
        </Field>

        <Field label="Vehicle">
          <Picker
            label="Vehicle"
            name="vehicleTypeId"
            value={vehicleTypeId}
            onChange={setVehicleTypeId}
            options={master.vehicleTypes.map((v) => ({
              value: v.id,
              label: v.name,
            }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fleet size">
            <div className="flex h-12 items-center rounded-xl border border-line bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/60">
              <button
                type="button"
                onClick={() => setFleet(String(Math.max(1, fleetCount - 1)))}
                className="h-full w-12 rounded-l-xl text-xl text-muted active:bg-canvas"
                aria-label="Decrease fleet size"
              >
                −
              </button>
              <input
                name="fleetSize"
                inputMode="numeric"
                required
                placeholder="—"
                aria-label="Fleet size"
                value={fleet}
                onChange={(e) => setFleet(e.target.value.replace(/\D/g, ""))}
                className="tabular w-full border-0 bg-transparent text-center text-lg font-semibold placeholder:font-normal placeholder:text-muted/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setFleet(String(fleetCount + 1))}
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

        {/* The price above is the monthly rate either way; this is the shape
            of the contract behind it, and the reason two deals at the same
            rent are not the same deal. */}
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
                    "flex h-12 flex-1 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition active:scale-[0.98]",
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
            {session.role === "admin" ? (
              <Field label="Deal Owner">
                <PickerField
                  label="Deal owner"
                  name="ownerUserId"
                  defaultValue={session.userId}
                  options={master.users.map((u) => ({
                    value: u.id,
                    label: u.name,
                  }))}
                />
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
            {session.role === "admin" ? "+ Deal owner, notes" : "+ Notes"}
          </button>
        )}

        {/* The sentence is one flex child, not several: a gap between them put
            a space in front of the full stop. */}
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Truck size={13} className="mt-0.5 shrink-0" />
          <span>
            Saved as <span className="font-medium">First Contact</span>, owned by{" "}
            <span className="font-medium">{session.name}</span>
            {month ? (
              <>
                , closing end of{" "}
                <span className="font-medium">{monthLabelLong(month)}</span>.
              </>
            ) : (
              ". No closing month picked, so it stays off the Forecast."
            )}
          </span>
        </p>

        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
