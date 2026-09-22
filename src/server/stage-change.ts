import { z } from "zod";

import type { SalesStage } from "@/db/schema";

/**
 * The decision half of `changeStage`, kept free of Next, Clerk and the
 * database so it can be tested directly.
 *
 * Everything here is per vehicle per month, matching `price` — see
 * `db/schema.ts`. The action layer adds the org scoping and writes the rows.
 */

/**
 * A figure the cost sheet must actually carry.
 *
 * `z.coerce.number()` alone reads both `null` and `""` as 0, and
 * `formToObject()` turns every blank field into `null` — so a sheet submitted
 * with Revenue empty would have been stored as a won deal earning ₹0, which
 * the Postgres check cannot catch either (0 is not null). The field has to be
 * present before it is coerced.
 */
const money = z
  .union([z.string().trim().min(1), z.number()])
  .transform(Number)
  // A non-numeric string becomes NaN here, which `z.number()` rejects.
  .pipe(z.number().int().min(0).max(2_000_000_000));

/**
 * "2026-10" -> "2026-10-31". Still how an expansion dates its deployment: it
 * is raised months ahead against a contract, not scheduled to a day.
 */
export function monthToLastDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

/**
 * A real calendar day, `YYYY-MM-DD`. Shared by the Closed Won sheet and the
 * expansion sheet, so both refuse the same things.
 *
 * The regex alone would pass "2026-02-31", which `new Date` silently rolls
 * over to 3 March — a date ops never agreed to. Round-tripping it catches
 * that, and the month-only string the sheets used to post.
 */
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an expected deployment date")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "That is not a real date");

/**
 * What a won deal must carry: its full cost sheet, and the month the trucks
 * are due out. The cost rule is also a check constraint in Postgres
 * (`opps_won_requires_costs`), as is the date (`opps_won_requires_deployment_date`);
 * this is the copy that produces a friendly prompt instead of a violation.
 */
export const closeWonSchema = z.object({
  /**
   * The day the trucks are due on the road.
   *
   * Asked here, at the moment of winning, because this is the only point where
   * anyone actually knows it. `expected_close_date` is a forecast made much
   * earlier about a different thing, and ops cannot plan against it.
   *
   * A day, not a month: ops schedules drivers and charging for a date, and a
   * month posted as its last day made every deal in a month look due on the
   * 30th — which is both wrong and, for most of them, late.
   */
  deploymentDate: calendarDate,
  revenue: money,
  leaseCost: money,
  driverCost: money,
  chargingCost: money,
  parkingCost: money,
  maintenanceCost: money,
  supervisorCost: money,
  miscCost: money,
});

/**
 * The same eight figures, saved mid-pipeline.
 *
 * A deal is priced and costed long before it is won — quoting is where those
 * numbers are worked out — so the sheet can be filled in at any stage and
 * revised as the deal moves. Every field is optional here: a half-built
 * estimate is worth keeping, and nothing downstream reads an open deal's
 * economics. What stays mandatory is the *moment of winning*, which still goes
 * through `closeWonSchema` and the Postgres check behind it.
 *
 * Blank means "cleared", not zero: `null` erases the figure so a guess never
 * hardens into a recorded ₹0.
 */
const optionalMoney = money.nullable().optional();

export const unitEconomicsSchema = z.object({
  revenue: optionalMoney,
  leaseCost: optionalMoney,
  driverCost: optionalMoney,
  chargingCost: optionalMoney,
  parkingCost: optionalMoney,
  maintenanceCost: optionalMoney,
  supervisorCost: optionalMoney,
  miscCost: optionalMoney,
});

export type UnitEconomics = z.infer<typeof unitEconomicsSchema>;

/** The eight keys, in the order the sheet asks for them. */
export const ECONOMICS_KEYS = [
  "revenue",
  "leaseCost",
  "driverCost",
  "chargingCost",
  "parkingCost",
  "maintenanceCost",
  "supervisorCost",
  "miscCost",
] as const;

export type EconomicsKey = (typeof ECONOMICS_KEYS)[number];

/** Which of the eight are still missing — what Closed Won will ask for. */
export function missingEconomics(
  row: Partial<Record<EconomicsKey, number | null>>,
): EconomicsKey[] {
  return ECONOMICS_KEYS.filter((k) => row[k] === null || row[k] === undefined);
}

export const closeLostSchema = z.object({
  lostReasonId: z.string().uuid("Pick a reason"),
  lostReasonNote: z.string().trim().max(1000).nullable().optional(),
});

export type StagePatch = {
  stage: SalesStage;
  updatedAt: Date;
  closedAt: Date | null;
  /** Set only on the way into closed_won. */
  deploymentDate?: string;
} & Partial<Omit<z.infer<typeof closeWonSchema>, "deploymentDate">>;

export type StagePlan =
  /** Already in that stage — nothing to write. */
  | { type: "noop" }
  /** The caller must collect the Closed Won sheet or the Closed Lost reason. */
  | { type: "needs"; needs: "won" | "lost" }
  | {
      type: "move";
      patch: StagePatch;
      /** Set only for closed_lost; the action still verifies the reason's org. */
      lostReason: { id: string; note: string | null } | null;
    };

/** The two stages that end a deal, and so need their extra block. */
export function isClosing(stage: SalesStage) {
  return stage === "closed_won" || stage === "closed_lost";
}

export function planStageChange({
  from,
  to,
  fields,
  stored,
  now = new Date(),
}: {
  from: SalesStage;
  to: SalesStage;
  fields?: Record<string, unknown>;
  /**
   * What the deal already carries. Economics filled in earlier in the pipeline
   * stand in for anything the Closed Won sheet does not post, so a deal that
   * was costed at Proposal is not made to type it all again — the rule is that
   * the figures must *exist* by Closed Won, not that they are typed there.
   */
  stored?: Partial<Record<EconomicsKey, number | null>>;
  now?: Date;
}): StagePlan {
  if (from === to) return { type: "noop" };

  const patch: StagePatch = {
    stage: to,
    updatedAt: now,
    // Reopening a closed deal clears the close date, so Wins-by-month never
    // counts a deal that has gone back into the pipeline.
    closedAt: isClosing(to) ? now : null,
  };

  if (to === "closed_won") {
    const posted = fields ?? {};
    const merged: Record<string, unknown> = { ...posted };
    for (const key of ECONOMICS_KEYS) {
      const value = merged[key];
      if ((value === undefined || value === null || value === "") && stored?.[key] != null) {
        merged[key] = stored[key];
      }
    }
    const parsed = closeWonSchema.safeParse(merged);
    if (!parsed.success) return { type: "needs", needs: "won" };
    const { deploymentDate, ...costs } = parsed.data;
    Object.assign(patch, costs);
    patch.deploymentDate = deploymentDate;
    return { type: "move", patch, lostReason: null };
  }

  if (to === "closed_lost") {
    const parsed = closeLostSchema.safeParse(fields ?? {});
    if (!parsed.success) return { type: "needs", needs: "lost" };
    return {
      type: "move",
      patch,
      lostReason: {
        id: parsed.data.lostReasonId,
        note: parsed.data.lostReasonNote ?? null,
      },
    };
  }

  return { type: "move", patch, lostReason: null };
}
