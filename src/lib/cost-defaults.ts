import { COST_FIELDS, type CostDimension, type CostFieldKey } from "@/lib/constants";

/**
 * Turning the defaults table into the figures one deal starts from.
 *
 * Kept free of Next, Clerk and the database so the matching rule can be tested
 * directly — it is the part that would otherwise only be checked by closing a
 * real deal and squinting at the sheet.
 */

/** One row of the defaults table, as the admin screen writes it. */
export type CostDefault = {
  costKey: string;
  vehicleTypeId: string | null;
  chargingScope: "client" | "moeving" | null;
  operatingDays: number | null;
  amount: number;
};

/** The answers a deal can offer a default to key off. */
export type DealAttributes = {
  vehicleTypeId: string | null;
  chargingScope: "client" | "moeving" | null;
  operatingDays: number | null;
};

/**
 * The default for every cost line this deal has the answers for.
 *
 * A line whose dimensions the deal cannot answer — no vehicle type chosen, no
 * operating days, no charging scope — is simply absent. It is not guessed at
 * and it is not zero: zero is a real cost that says "this is free", and a deal
 * that has not been asked about charging has not said that.
 *
 * A line the admin has not set is absent for the same reason.
 */
export type CostSuggestions = Partial<Record<CostFieldKey, number>>;

export function defaultsFor(
  deal: DealAttributes,
  rows: CostDefault[],
): CostSuggestions {
  const out: CostSuggestions = {};

  for (const field of COST_FIELDS) {
    const wanted = dimensionValues(field.dimensions, deal);
    // An unanswered dimension: nothing to look up, so nothing to fill in.
    if (wanted === null) continue;

    const match = rows.find(
      (r) =>
        r.costKey === field.key &&
        // Every dimension the line does not use must be null on the row too,
        // so a stale row left behind by a change in `dimensions` cannot be
        // picked up by accident.
        r.vehicleTypeId === (wanted.vehicleType ?? null) &&
        r.chargingScope === (wanted.chargingScope ?? null) &&
        r.operatingDays === (wanted.operatingDays ?? null),
    );
    if (match) out[field.key] = match.amount;
  }

  return out;
}

/**
 * The deal's answers for the dimensions a line uses, or null when one of them
 * is unanswered.
 */
function dimensionValues(
  dimensions: readonly CostDimension[],
  deal: DealAttributes,
): Partial<Record<CostDimension, string | number>> | null {
  const values: Partial<Record<CostDimension, string | number>> = {};
  for (const d of dimensions) {
    const value =
      d === "vehicleType"
        ? deal.vehicleTypeId
        : d === "chargingScope"
          ? deal.chargingScope
          : deal.operatingDays;
    if (value === null || value === undefined) return null;
    values[d] = value;
  }
  return values;
}

/**
 * Which stored figures no longer match what the defaults would give.
 *
 * Saved numbers are never rewritten behind someone's back — a deal costed in
 * March keeps March's figures when a lease rate changes, and an override
 * someone typed on purpose stays typed. This only says which lines differ, so
 * the deal page can mention it and a person can decide.
 */
export function driftedFrom(
  stored: Partial<Record<CostFieldKey, number | null>>,
  defaults: Partial<Record<CostFieldKey, number>>,
): CostFieldKey[] {
  return COST_FIELDS.filter((f) => {
    const now = defaults[f.key];
    const saved = stored[f.key];
    return now !== undefined && saved !== null && saved !== undefined && saved !== now;
  }).map((f) => f.key);
}
