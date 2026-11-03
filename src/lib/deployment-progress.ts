import type { DropReason } from "@/db/schema";

/**
 * Where a won deal's vehicles are: on the road, dropped, or still to go.
 *
 * `fleet_size` is what was SOLD and never changes because a few trucks fell
 * through — that would restate a reported win. Instead the vehicles that will
 * never go out are counted as dropped, with a reason, and a deal leaves the
 * Deployments queue once deployed + dropped covers the fleet.
 *
 * Kept free of React so the rules are tested directly.
 */

export type Progress = {
  fleetSize: number;
  vehiclesDeployed: number;
  /** Optional so older callers and tests that predate dropping still fit. */
  vehiclesDropped?: number;
};

/** Vehicles still owed: sold, minus out, minus dropped. Never negative. */
export const stillToGo = (d: Progress) =>
  Math.max(0, d.fleetSize - d.vehiclesDeployed - (d.vehiclesDropped ?? 0));

/** Nothing left to send — every vehicle is out or has been dropped. */
export const isClosedOut = (d: Progress) => stillToGo(d) === 0;

/** Vehicles that will actually run: sold minus dropped. */
export const committed = (d: Progress) =>
  Math.max(0, d.fleetSize - (d.vehiclesDropped ?? 0));

/** The reasons offered, in the order the sheet shows them. */
export const DROP_REASONS: { value: DropReason; label: string }[] = [
  { value: "vehicle_unavailable", label: "Vehicle unavailable" },
  { value: "driver_unavailable", label: "Driver unavailable" },
  { value: "charging_constraint", label: "Charging constraint" },
  { value: "demand_lost", label: "Demand does not exist anymore" },
  { value: "other", label: "Others" },
];

export const DROP_REASON_LABEL = Object.fromEntries(
  DROP_REASONS.map((r) => [r.value, r.label]),
) as Record<DropReason, string>;

export type DropRequest = {
  vehicles: number;
  reason: DropReason | null;
  note: string | null;
};

/**
 * Decide whether some of a deal's remaining vehicles may be dropped.
 *
 * Only what is still to go can be dropped — a truck on the road is not
 * "dropped", it is a correction to the deployed count. A reason is required,
 * and "Others" has to say what (the database checks both as well).
 */
export function planDrop(
  d: Progress,
  req: DropRequest,
): { ok: true; vehiclesDropped: number } | { ok: false; error: string } {
  const left = stillToGo(d);
  if (left === 0) {
    return { ok: false, error: "There are no vehicles left to drop on this deal." };
  }
  if (!Number.isInteger(req.vehicles) || req.vehicles < 1 || req.vehicles > left) {
    return {
      ok: false,
      error: `${left} ${left === 1 ? "vehicle is" : "vehicles are"} still to go, so that number has to be between 1 and ${left}.`,
    };
  }
  if (!req.reason || !(req.reason in DROP_REASON_LABEL)) {
    return { ok: false, error: "Pick why these vehicles are not being deployed." };
  }
  if (req.reason === "other" && !req.note?.trim()) {
    return { ok: false, error: "Say what happened — “Others” needs a sentence." };
  }
  return { ok: true, vehiclesDropped: (d.vehiclesDropped ?? 0) + req.vehicles };
}
