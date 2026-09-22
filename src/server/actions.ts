"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  accounts,
  cities as cityTable,
  costDefaults,
  leads,
  lostReasons,
  opportunities,
  opportunityEvents,
  salesStage,
  users,
  vehicleTypes,
} from "@/db/schema";
import type { SalesStage } from "@/db/schema";
import { COST_FIELDS, OPERATING_DAYS } from "@/lib/constants";
import { defaultsFor, type CostSuggestions } from "@/lib/cost-defaults";
import { inr, todayInIndia } from "@/lib/utils";
import {
  requireAdmin,
  requireDealOwner,
  requireDeployments,
  requireLeads,
  requireSales,
} from "@/server/auth";
import { getCostDefaults, getQuickAddData, type QuickAddData } from "@/server/queries";
import { sendInvitation } from "@/server/invites";
import {
  calendarDate,
  ECONOMICS_KEYS,
  type EconomicsKey,
  missingEconomics,
  monthToLastDay,
  planStageChange,
  unitEconomicsSchema,
} from "@/server/stage-change";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * An amount that may genuinely be absent.
 *
 * The field has to be PRESENT before it is coerced. `z.coerce.number()` reads
 * null as 0, so a union of `[coerced, null]` matches the coerced branch first
 * and a blank price was stored as ₹0 — indistinguishable from a deal actually
 * quoted at nothing. formToObject() turns empty strings into null, so null is
 * the only "not stated" value that reaches here.
 */
const optionalMoney = z
  .union([z.string().trim().min(1), z.number()])
  .transform(Number)
  .pipe(z.number().int().min(0).max(2_000_000_000))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const uuidish = z
  .string()
  .uuid()
  .or(z.literal("").transform(() => null))
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

// Derived from the database enum rather than retyped, so adding a stage is one
// edit in schema.ts and a migration — never a list that silently drifts.
const stageEnum = z.enum(salesStage.enumValues);

const closeMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Pick an expected closing month")
  .nullable()
  .optional()
  .transform((v) => (v ? monthToLastDay(v) : null));

const baseOpportunity = z.object({
  accountName: z.string().trim().min(1, "Customer is required").max(160),
  name: z.string().trim().max(160).optional(),
  cityId: uuidish,
  vehicleTypeId: uuidish,
  driverType: z
    .enum(["driver_only", "driver_plus_helper", "driver_cum_helper"])
    .nullable()
    .optional(),
  chargingScope: z.enum(["client", "moeving"]).nullable().optional(),
  fleetSize: z.coerce.number().int().min(1).max(100_000),
  price: optionalMoney,
  /** 26 or 30 — the shape of the contract, not a figure to compute with. */
  operatingDays: z
    .union([z.string().trim().min(1), z.number()])
    .transform(Number)
    .pipe(z.number().int().refine((v) => OPERATING_DAYS.some((d) => d.value === v)))
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  expectedCloseMonth: closeMonth,
  /**
   * The day the trucks are due. Optional everywhere except a won deal, which
   * `opps_won_requires_deployment_date` will not let go null.
   */
  deploymentDate: calendarDate.nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  ownerUserId: uuidish,
  stage: stageEnum.optional(),
});

/** Find-or-create the customer, scoped to the caller's org. */
async function resolveAccount(
  organizationId: string,
  userId: string,
  name: string,
) {
  const trimmed = name.trim();
  const existing = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.organizationId, organizationId),
      eq(accounts.name, trimmed),
    ),
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(accounts)
    .values({ organizationId, name: trimmed, createdByUserId: userId })
    .returning();
  return created!.id;
}

function formToObject(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") raw[key] = value === "" ? null : value;
  }
  return raw;
}

/* ------------------------------------------------------------- create/edit */

export async function createOpportunity(
  formData: FormData,
): Promise<ActionResult<{ id: string; count: number }>> {
  const session = await requireDealOwner();
  const parsed = baseOpportunity.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  // Deal owners always own what they create; only an admin may assign.
  const ownerUserId =
    session.role === "admin" && input.ownerUserId
      ? await assertOrgUser(session.organizationId, input.ownerUserId)
      : session.userId;

  const accountId = await resolveAccount(
    session.organizationId,
    session.userId,
    input.accountName,
  );

  // One customer wanting trucks in three cities is three deals: they close on
  // their own timelines and belong to different city forecasts. The form lets
  // a deal owner say that once instead of filling the sheet three times.
  const cityIds = formData
    .getAll("cityIds")
    .filter((v): v is string => typeof v === "string" && v !== "");
  const cities = cityIds.length ? cityIds : [input.cityId];

  const cityNames = new Map<string, string>();
  if (cityIds.length) {
    const rows = await db
      .select({ id: cityTable.id, name: cityTable.name })
      .from(cityTable)
      .where(
        and(
          eq(cityTable.organizationId, session.organizationId),
          inArray(cityTable.id, cityIds),
        ),
      );
    for (const r of rows) cityNames.set(r.id, r.name);
    // A city id that is not this organization's is simply not a city here.
    if (rows.length !== cityIds.length) {
      return { ok: false, error: "One of those cities is no longer available" };
    }
  }

  const baseName = input.name?.trim() || input.accountName.trim();
  const created = await db
    .insert(opportunities)
    .values(
      cities.map((cityId) => ({
        organizationId: session.organizationId,
        accountId,
        name:
          cities.length > 1 && cityId && cityNames.get(cityId)
            ? `${baseName} - ${cityNames.get(cityId)}`
            : baseName,
        stage: input.stage ?? "first_contact",
        cityId,
        vehicleTypeId: input.vehicleTypeId,
        driverType: input.driverType ?? null,
        chargingScope: input.chargingScope ?? null,
        fleetSize: input.fleetSize,
        price: input.price,
        /*
         * Revenue per vehicle IS the price per vehicle — one figure, and the
         * one every margin column in Postgres is generated from.
         *
         * Quick Add wrote the price and left revenue null, so a brand-new
         * deal had total_revenue 0 and margin_pct null however carefully it
         * was costed afterwards: the Pipeline's Total cost and Margin %
         * columns stayed empty until somebody happened to edit the price,
         * which is the one edit that used to carry revenue with it.
         */
        revenue: input.price,
        operatingDays: input.operatingDays,
        expectedCloseDate: input.expectedCloseMonth,
        ownerUserId,
        notes: input.notes ?? null,
      })),
    )
    .returning();

  await db.insert(opportunityEvents).values(
    created.map((o) => ({
      organizationId: session.organizationId,
      opportunityId: o.id,
      userId: session.userId,
      kind: "created" as const,
      toStage: o.stage,
    })),
  );

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath("/forecast");
  return { ok: true, data: { id: created[0]!.id, count: created.length } };
}

export async function updateOpportunity(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSales();
  const existing = await loadOwned(session.organizationId, id);
  if (!existing) return { ok: false, error: "Opportunity not found" };

  const parsed = baseOpportunity.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  const accountId = await resolveAccount(
    session.organizationId,
    session.userId,
    input.accountName,
  );
  const ownerUserId =
    session.role === "admin" && input.ownerUserId
      ? await assertOrgUser(session.organizationId, input.ownerUserId)
      : existing.ownerUserId;

  // A customer cutting their order below what is already on the road would
  // otherwise trip `opps_deployed_within_fleet`. The trucks that went out did
  // go out, so the count follows the fleet down rather than the edit failing.
  const vehiclesDeployed = Math.min(existing.vehiclesDeployed, input.fleetSize);

  /**
   * A price change is a revenue change.
   *
   * `price` and the Closed Won `revenue` are the same figure — the money one
   * vehicle earns in a month — so revenue is written from price rather than
   * typed a second time. A won deal may not hold a NULL revenue (the
   * `opps_won_requires_costs` check), so clearing the price of a won deal is
   * refused rather than allowed to fail at the database.
   */
  const repricing = (existing.price ?? null) !== (input.price ?? null);
  const isWon = existing.stage === "closed_won";
  if (repricing && isWon && input.price === null) {
    return {
      ok: false,
      error:
        "This deal is won, so it has to keep a price — that figure is the revenue already reported for the month it closed in.",
    };
  }

  // A won deal ops is already planning against cannot lose its date: the
  // `opps_won_requires_deployment_date` check would refuse it at the database,
  // and a violation is a worse way to learn that than a sentence.
  if (isWon && input.deploymentDate === null) {
    return {
      ok: false,
      error:
        "This deal is won, so it has to keep a deployment date — ops is planning against it.",
    };
  }

  await db
    .update(opportunities)
    .set({
      accountId,
      vehiclesDeployed,
      deploymentDate: input.deploymentDate ?? null,
      name: input.name?.trim() || input.accountName.trim(),
      cityId: input.cityId,
      vehicleTypeId: input.vehicleTypeId,
      driverType: input.driverType ?? null,
      chargingScope: input.chargingScope ?? null,
      fleetSize: input.fleetSize,
      price: input.price,
      operatingDays: input.operatingDays,
      expectedCloseDate: input.expectedCloseMonth,
      // Revenue per vehicle IS the price per vehicle — one number, kept in one
      // place. Changing the rate here changes what the deal earns, including
      // on a won deal, whose timeline then says so below.
      ...(repricing ? { revenue: input.price } : {}),
      ownerUserId,
      notes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(opportunities.id, id),
        eq(opportunities.organizationId, session.organizationId),
      ),
    );

  await db.insert(opportunityEvents).values({
    organizationId: session.organizationId,
    opportunityId: id,
    userId: session.userId,
    kind: "updated",
  });

  // Repricing a won deal restates a month that has already been reported, so
  // it is never silent: the deal's own timeline carries the before and after.
  if (repricing && isWon) {
    await db.insert(opportunityEvents).values({
      organizationId: session.organizationId,
      opportunityId: id,
      userId: session.userId,
      kind: "note",
      body: `Price per vehicle changed from ${inr(existing.price)} to ${inr(
        input.price,
      )}. Revenue and margin for this won deal now follow it.`,
    });
  }

  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/pipeline");
  revalidatePath("/forecast");
  revalidatePath("/dashboard");
  return { ok: true };
}

/* ---------------------------------------------------------------- expansion */

/**
 * Repeat business: an existing customer taking more vehicles on terms that are
 * already agreed.
 *
 * Three things are genuinely new — where the trucks go, how many, and when.
 * Everything else is the won deal's, copied here rather than re-entered,
 * because the unit economics of that contract are settled. The copy happens on
 * the server reading the parent row, so the locked figures are not merely
 * disabled inputs someone could re-enable and post.
 *
 * It lands as Closed Won: nothing about it is being sold. Two dates come out
 * of that, and they are not the same date:
 *
 * - `closed_at` and `expected_close_date` are TODAY, the day the expansion was
 *   raised. That is what Wins-by-month and the forecast count, so a delivery
 *   that slips by a fortnight cannot quietly restate last month's revenue.
 * - `deployment_date` is the day the trucks are due out, and drives the
 *   Deployments queue and nothing else.
 */
const expansionSchema = z.object({
  cityId: uuidish,
  fleetSize: z.coerce.number().int().min(1).max(100_000),
  /** The day the added vehicles are due out — what ops plans against. */
  deploymentDate: calendarDate,
});

export async function createExpansion(
  parentId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSales();
  const parent = await loadOwned(session.organizationId, parentId);
  if (!parent) return { ok: false, error: "That deal no longer exists" };
  if (parent.stage !== "closed_won") {
    return { ok: false, error: "Only a won deal can take more vehicles" };
  }

  const parsed = expansionSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  // A city id comes off a form, so it is checked against this organization.
  let cityId: string | null = null;
  let cityName: string | null = null;
  if (input.cityId) {
    const city = await db.query.cities.findFirst({
      where: and(
        eq(cityTable.id, input.cityId),
        eq(cityTable.organizationId, session.organizationId),
      ),
    });
    if (!city) return { ok: false, error: "That city is no longer available" };
    cityId = city.id;
    cityName = city.name;
  }

  const account = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.id, parent.accountId),
      eq(accounts.organizationId, session.organizationId),
    ),
  });

  // Two different dates, deliberately: the expansion is recorded now, and the
  // trucks go out when they go out.
  const raisedAt = new Date();
  const raisedOn = todayInIndia(raisedAt);
  const deployOn = input.deploymentDate;
  const label = `+${input.fleetSize} vehicle${input.fleetSize === 1 ? "" : "s"}`;
  const name = cityName
    ? `${account?.name ?? parent.name} - ${cityName} (${label})`
    : `${account?.name ?? parent.name} (${label})`;

  const [created] = await db
    .insert(opportunities)
    .values({
      organizationId: session.organizationId,
      accountId: parent.accountId,
      name: name.slice(0, 160),
      stage: "closed_won",
      // --- the three things this sheet asks for ---
      cityId,
      fleetSize: input.fleetSize,
      // Ops plans against this, and only this.
      deploymentDate: deployOn,
      // Reporting counts the expansion when it was raised, not when the trucks
      // roll: the business committed to the revenue the day the paperwork was
      // agreed, and a deployment that slips must not move a recorded win into
      // another month.
      expectedCloseDate: raisedOn,
      closedAt: raisedAt,
      // --- locked: the contract this grew out of, not a fresh negotiation ---
      vehicleTypeId: parent.vehicleTypeId,
      driverType: parent.driverType,
      chargingScope: parent.chargingScope,
      price: parent.price,
      revenue: parent.revenue,
      leaseCost: parent.leaseCost,
      driverCost: parent.driverCost,
      chargingCost: parent.chargingCost,
      parkingCost: parent.parkingCost,
      maintenanceCost: parent.maintenanceCost,
      supervisorCost: parent.supervisorCost,
      miscCost: parent.miscCost,
      // The account stays with whoever owns the relationship.
      ownerUserId: parent.ownerUserId,
      parentOpportunityId: parent.id,
    })
    .returning();

  await db.insert(opportunityEvents).values([
    {
      organizationId: session.organizationId,
      opportunityId: created!.id,
      userId: session.userId,
      kind: "created" as const,
      toStage: created!.stage,
    },
    {
      organizationId: session.organizationId,
      opportunityId: parent.id,
      userId: session.userId,
      kind: "note" as const,
      body: `Follow-on deployment: ${label}${cityName ? ` in ${cityName}` : ""}, deploying ${deployOn}.`,
    },
  ]);

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath("/forecast");
  revalidatePath(`/opportunities/${parent.id}`);
  return { ok: true, data: { id: created!.id } };
}

/* -------------------------------------------------------------- deployments */

/**
 * Ops recording how many vehicles are actually out.
 *
 * A count, not a tick: part of a fleet going first is normal, and a flag would
 * force somebody to choose between lying and waiting. Writing the same number
 * again is a no-op rather than an error, because two people looking at the
 * same van should not produce a conflict.
 */
export async function recordDeployment(
  id: string,
  vehiclesDeployed: number,
): Promise<ActionResult> {
  const session = await requireDeployments();
  const existing = await loadOwned(session.organizationId, id);
  if (!existing) return { ok: false, error: "Deal not found" };
  if (existing.stage !== "closed_won") {
    return { ok: false, error: "Only a won deal has vehicles to deploy" };
  }

  const parsed = z
    .number()
    .int()
    .min(0)
    .max(existing.fleetSize)
    .safeParse(vehiclesDeployed);
  if (!parsed.success) {
    return {
      ok: false,
      error: `This deal is for ${existing.fleetSize} vehicles, so that number has to be between 0 and ${existing.fleetSize}.`,
    };
  }
  const next = parsed.data;
  if (next === existing.vehiclesDeployed) return { ok: true };

  await db
    .update(opportunities)
    .set({ vehiclesDeployed: next, updatedAt: new Date() })
    .where(
      and(
        eq(opportunities.id, id),
        eq(opportunities.organizationId, session.organizationId),
      ),
    );

  // The deal's own timeline is where sales looks to answer "is it out yet".
  await db.insert(opportunityEvents).values({
    organizationId: session.organizationId,
    opportunityId: id,
    userId: session.userId,
    kind: "note",
    body:
      next >= existing.fleetSize
        ? `All ${existing.fleetSize} vehicles deployed.`
        : `${next} of ${existing.fleetSize} vehicles deployed.`,
  });

  revalidatePath("/deployments");
  revalidatePath(`/opportunities/${id}`);
  return { ok: true };
}

/* ------------------------------------------------------------- quick add */

/**
 * What the Add deal sheet needs, fetched when it opens.
 *
 * The app shell used to carry this on every page view so the sheet could open
 * with no wait. That put four master-data queries and the whole customer list
 * into the payload of every navigation, for a sheet most page views never
 * open. It is one request now, made the first time somebody presses +, and
 * the client keeps it for the rest of the visit.
 */
export async function loadQuickAddData(): Promise<ActionResult<QuickAddData>> {
  await requireDealOwner();
  return { ok: true, data: await getQuickAddData() };
}

/* --------------------------------------------------------- unit economics */

export type EconomicsSheet = Record<EconomicsKey, number | null>;

/** The eight figures off a deal row, and nothing else. */
function pickEconomics(row: Partial<EconomicsSheet>): EconomicsSheet {
  return Object.fromEntries(
    ECONOMICS_KEYS.map((k) => [k, row[k] ?? null]),
  ) as EconomicsSheet;
}

/**
 * What the deal carries today, for the sheets that prefill from it.
 *
 * The pipeline card does not select these columns — it would carry eight more
 * numbers into every row of a 250-deal table to serve one sheet — so the
 * Closed Won sheet asks for them when it opens instead.
 */
export async function loadUnitEconomics(
  id: string,
): Promise<ActionResult<{ sheet: EconomicsSheet; defaults: CostSuggestions }>> {
  const session = await requireSales();
  const existing = await loadOwned(session.organizationId, id);
  if (!existing) return { ok: false, error: "Deal not found" };
  return {
    ok: true,
    data: {
      sheet: pickEconomics(existing),
      defaults: defaultsFor(
        {
          vehicleTypeId: existing.vehicleTypeId,
          chargingScope: existing.chargingScope,
          operatingDays: existing.operatingDays,
        },
        await getCostDefaults(),
      ),
    },
  };
}

/* --------------------------------------------------- cost defaults (admin) */

/**
 * Setting, or clearing, one cell of the defaults table.
 *
 * A blank amount deletes the row rather than storing a zero: zero is a real
 * cost that says "this is free" — client-paid charging genuinely is — and
 * "nobody has said" has to stay distinguishable from it, or the cost sheet
 * would pre-fill a figure the business never agreed.
 */
export async function saveCostDefault(input: {
  costKey: string;
  vehicleTypeId: string | null;
  chargingScope: "client" | "moeving" | null;
  operatingDays: number | null;
  amount: number | null;
}): Promise<ActionResult> {
  const session = await requireAdmin();

  const field = COST_FIELDS.find((f) => f.key === input.costKey);
  if (!field) return { ok: false, error: "Unknown cost line" };

  // A row may only carry the dimensions its cost line actually varies by, so
  // the lookup stays exact and a rule change cannot leave rows that still
  // match something.
  const dims = field.dimensions as readonly string[];
  const row = {
    vehicleTypeId: dims.includes("vehicleType") ? input.vehicleTypeId : null,
    chargingScope: dims.includes("chargingScope") ? input.chargingScope : null,
    operatingDays: dims.includes("operatingDays") ? input.operatingDays : null,
  };
  if (dims.includes("vehicleType") && !row.vehicleTypeId) {
    return { ok: false, error: "Pick a vehicle type" };
  }
  if (row.vehicleTypeId) {
    const vehicle = await db.query.vehicleTypes.findFirst({
      where: and(
        eq(vehicleTypes.id, row.vehicleTypeId),
        eq(vehicleTypes.organizationId, session.organizationId),
      ),
    });
    if (!vehicle) return { ok: false, error: "Unknown vehicle type" };
  }

  const where = and(
    eq(costDefaults.organizationId, session.organizationId),
    eq(costDefaults.costKey, field.key),
    row.vehicleTypeId
      ? eq(costDefaults.vehicleTypeId, row.vehicleTypeId)
      : isNull(costDefaults.vehicleTypeId),
    row.chargingScope
      ? eq(costDefaults.chargingScope, row.chargingScope)
      : isNull(costDefaults.chargingScope),
    row.operatingDays
      ? eq(costDefaults.operatingDays, row.operatingDays)
      : isNull(costDefaults.operatingDays),
  );

  if (input.amount === null) {
    await db.delete(costDefaults).where(where);
  } else {
    const parsed = z.number().int().min(0).max(2_000_000_000).safeParse(input.amount);
    if (!parsed.success) return { ok: false, error: "That is not an amount" };

    const existing = await db.select({ id: costDefaults.id }).from(costDefaults).where(where);
    if (existing.length) {
      await db
        .update(costDefaults)
        .set({ amount: parsed.data, updatedAt: new Date() })
        .where(where);
    } else {
      await db.insert(costDefaults).values({
        organizationId: session.organizationId,
        costKey: field.key,
        ...row,
        amount: parsed.data,
      });
    }
  }

  revalidatePath("/admin/cost-defaults");
  return { ok: true };
}

/**
 * Filling the blanks on deals nobody has costed yet.
 *
 * Setting a standard rate in Admin does nothing to a deal on its own — the
 * rules pre-fill the cost sheet the next time somebody opens it, which means
 * a pipeline of deals raised before the rates existed shows no cost and no
 * margin until each one is opened by hand. This is the one deliberate act
 * that closes that gap.
 *
 * It obeys the same rule the sheet does, and that is the whole reason it is
 * safe: a figure already saved is never touched, only a blank one is filled.
 * A won deal cannot have a blank (`opps_won_requires_costs` sees to that), so
 * nothing here can restate a margin already reported.
 */
export async function applyCostDefaults(): Promise<
  ActionResult<{ deals: number; figures: number }>
> {
  const session = await requireAdmin();
  const defaults = await getCostDefaults();
  if (!defaults.length) {
    return { ok: false, error: "No standard rates are set yet." };
  }

  const open = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.organizationId, session.organizationId));

  let deals = 0;
  let figures = 0;

  for (const deal of open) {
    const suggested = defaultsFor(
      {
        vehicleTypeId: deal.vehicleTypeId,
        chargingScope: deal.chargingScope,
        operatingDays: deal.operatingDays,
      },
      defaults,
    );

    const patch: Partial<Record<EconomicsKey, number>> = {};

    // A deal quoted before revenue was written from price carries a price and
    // no revenue, which leaves every generated margin column blank. The two
    // are the same figure, so this is a repair, not a restatement.
    if (deal.revenue === null && deal.price !== null) {
      patch.revenue = deal.price;
      figures += 1;
    }

    for (const field of COST_FIELDS) {
      const rate = suggested[field.key];
      // Blank only. A typed figure — and every figure on a won deal is one —
      // stays exactly as it was saved.
      if (rate !== undefined && deal[field.key] === null) {
        patch[field.key] = rate;
        figures += 1;
      }
    }
    if (Object.keys(patch).length === 0) continue;

    await db
      .update(opportunities)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(opportunities.id, deal.id));
    deals += 1;
  }

  revalidatePath("/admin/cost-defaults");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true, data: { deals, figures } };
}

/**
 * Cost the deal whenever it is known, not only when it is won.
 *
 * Pricing work happens at quoting, and a deal that has been costed for weeks
 * should not arrive at Closed Won with an empty sheet and a person trying to
 * remember numbers. So the figures can be saved and revised at any stage; the
 * mandate lives at the one place it matters — the move into Closed Won, which
 * still refuses to happen without all eight (`closeWonSchema`, and the
 * `opps_won_requires_costs` check behind it).
 *
 * On a deal that is already won the sheet may be corrected but not emptied:
 * blanking a figure there would fail that check, and the recorded margin for
 * a month that has been reported should never silently become ₹0.
 */
export async function saveUnitEconomics(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSales();
  const existing = await loadOwned(session.organizationId, id);
  if (!existing) return { ok: false, error: "Deal not found" };

  const parsed = unitEconomicsSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Those figures are not valid",
    };
  }

  /**
   * Revenue is not asked for here, whatever the form posts.
   *
   * The money one vehicle earns in a month is the price it was quoted at —
   * one number, held on the deal. Asking for it twice produced two fields
   * that could disagree, and nobody could say which was right.
   */
  const next = { ...pickEconomics(parsed.data), revenue: existing.price ?? null };
  if (existing.price === null) {
    return {
      ok: false,
      error:
        "Set the price per vehicle on this deal first — that price is the revenue, so the sheet has nothing to earn from without it.",
    };
  }
  if (existing.stage === "closed_won" && missingEconomics(next).length > 0) {
    return {
      ok: false,
      error:
        "This deal is won, so its cost sheet has to stay complete. Fill every field, or move the deal out of Closed Won first.",
    };
  }

  const changed = ECONOMICS_KEYS.filter((k) => (existing[k] ?? null) !== next[k]);
  if (changed.length === 0) return { ok: true };

  await db
    .update(opportunities)
    .set({ ...next, updatedAt: new Date() })
    .where(
      and(
        eq(opportunities.id, id),
        eq(opportunities.organizationId, session.organizationId),
      ),
    );

  const left = missingEconomics(next).length;
  await db.insert(opportunityEvents).values({
    organizationId: session.organizationId,
    opportunityId: id,
    userId: session.userId,
    kind: "note",
    body:
      left === 0
        ? "Unit economics updated — full sheet, ready to close."
        : `Unit economics updated — ${left} ${left === 1 ? "figure" : "figures"} still to fill in.`,
  });

  // A won deal's numbers feed Wins and the dashboard; an open deal's do not,
  // but revalidating both costs nothing and cannot go stale.
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath("/forecast");
  revalidatePath(`/opportunities/${id}`);
  return { ok: true };
}

/* ------------------------------------------------------------ stage change */

/**
 * The one-tap path from the pipeline. Won and Lost need their extra block,
 * Contracting is offered one; every other stage moves with no questions asked.
 *
 * The decision — noop, ask for the block, or here is the patch — lives in
 * `stage-change.ts` so it can be tested without Next, Clerk or a database.
 */
export async function changeStage(
  id: string,
  stage: SalesStage,
  formData?: FormData,
): Promise<ActionResult<{ needs?: "won" | "lost" | "contracting" }>> {
  const session = await requireSales();
  const existing = await loadOwned(session.organizationId, id);
  if (!existing) return { ok: false, error: "Opportunity not found" };

  const plan = planStageChange({
    from: existing.stage,
    to: stage,
    fields: formData ? formToObject(formData) : {},
    // Anything already costed earlier in the pipeline counts, and so does a
    // deployment date pencilled in at Contracting. Closed Won asks for a
    // complete answer, not for it to be retyped at the last step.
    stored: { ...pickEconomics(existing), deploymentDate: existing.deploymentDate },
  });
  if (plan.type === "noop") return { ok: true };
  if (plan.type === "needs") return { ok: true, data: { needs: plan.needs } };

  const patch: Partial<typeof opportunities.$inferInsert> = { ...plan.patch };

  // The Won sheet asks for the price per vehicle and posts it as `revenue`,
  // because they are the same figure. Writing it back to `price` too keeps the
  // deal's quoted rate and its recorded revenue from ever drifting apart.
  if (patch.revenue != null) patch.price = patch.revenue;

  if (plan.lostReason) {
    // A reason id is a form field, so it is checked against this org before it
    // is trusted — the same rule as every other id crossing the wire.
    const reason = await db.query.lostReasons.findFirst({
      where: and(
        eq(lostReasons.id, plan.lostReason.id),
        eq(lostReasons.organizationId, session.organizationId),
      ),
    });
    if (!reason) return { ok: false, error: "Unknown reason" };
    patch.lostReasonId = reason.id;
    patch.lostReasonNote = plan.lostReason.note;
  }

  await db
    .update(opportunities)
    .set(patch)
    .where(
      and(
        eq(opportunities.id, id),
        eq(opportunities.organizationId, session.organizationId),
      ),
    );

  await db.insert(opportunityEvents).values({
    organizationId: session.organizationId,
    opportunityId: id,
    userId: session.userId,
    kind: "stage_changed",
    fromStage: existing.stage,
    toStage: stage,
  });

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath("/forecast");
  revalidatePath(`/opportunities/${id}`);
  return { ok: true };
}

export async function addNote(id: string, body: string): Promise<ActionResult> {
  const session = await requireSales();
  const text = body.trim();
  if (!text) return { ok: false, error: "Note is empty" };
  const existing = await loadOwned(session.organizationId, id);
  if (!existing) return { ok: false, error: "Opportunity not found" };

  await db.insert(opportunityEvents).values({
    organizationId: session.organizationId,
    opportunityId: id,
    userId: session.userId,
    kind: "note",
    body: text,
  });
  revalidatePath(`/opportunities/${id}`);
  return { ok: true };
}

/**
 * Remove a deal for good.
 *
 * A won deal is not just a row: it is a month in the wins report and a slice
 * of reported margin. Deleting one silently restates both, so that is an
 * admin's call, not a deal owner's. Anything still open is the owner's to
 * clear up — a duplicate typed in twice should not need an admin.
 *
 * Follow-on deployments are left standing (`parent_opportunity_id` is ON
 * DELETE SET NULL); the caller is told how many so it is not a surprise.
 *
 * A deal that came from a lead has to be unpicked first. `leads.opportunity_id`
 * is ON DELETE SET NULL, and `leads_converted_requires_opportunity` forbids a
 * converted lead from holding a null one — so the cascade fought the check and
 * Postgres refused the whole delete. Every deal raised from the Leads screen
 * was undeletable, and the page could only say "check your connection".
 *
 * The lead goes back to `qualified`, which is what it was the moment before
 * somebody converted it, and keeps a remark saying where its deal went. It is
 * not deleted with the deal: somebody rang that company, and the enquiry
 * happened whatever became of the deal afterwards.
 */
export async function deleteOpportunity(id: string): Promise<ActionResult> {
  const session = await requireSales();
  const existing = await loadOwned(session.organizationId, id);
  if (!existing) return { ok: false, error: "Opportunity not found" };
  if (session.role !== "admin" && existing.ownerUserId !== session.userId) {
    return { ok: false, error: "Only the deal owner or an admin can delete this" };
  }
  if (existing.stage === "closed_won" && session.role !== "admin") {
    return {
      ok: false,
      error:
        "This is a recorded win — deleting it changes past reported revenue. Ask an admin.",
    };
  }
  /*
   * Two statements, deliberately NOT a transaction.
   *
   * Production runs Neon over HTTP (`drizzle-orm/neon-http`), which has no
   * transaction support at all — `db.transaction()` throws "No transactions
   * support in neon-http driver" the moment it is called. A local Postgres
   * uses node-postgres, where it works perfectly, so a transaction here
   * passes every local test and fails for every real user. See HANDOFF § 6.
   *
   * The order is the safe one. Detaching the lead first means the worst case
   * is a lead handed back to the desk whose deal still exists — visible,
   * and one re-conversion away. Deleting first is not even possible: that is
   * the constraint violation this whole function exists to avoid.
   */
  await db
    .update(leads)
    .set({
      status: "qualified",
      opportunityId: null,
      convertedAt: null,
      remarks: sql`coalesce(${leads.remarks} || ' · ', '') || 'The deal raised from this lead was deleted.'`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(leads.opportunityId, id),
        eq(leads.organizationId, session.organizationId),
      ),
    );

  await db
    .delete(opportunities)
    .where(
      and(
        eq(opportunities.id, id),
        eq(opportunities.organizationId, session.organizationId),
      ),
    );

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath("/forecast");
  revalidatePath("/leads");
  return { ok: true };
}

/* -------------------------------------------------------------------- admin */

export type UpsertUserResult = { invited?: boolean; inviteWarning?: string };

export async function upsertUser(
  formData: FormData,
): Promise<ActionResult<UpsertUserResult>> {
  const session = await requireAdmin();
  const parsed = z
    .object({
      id: uuidish,
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().toLowerCase(),
      // Derived from the database enum, so a new role is one edit, not three.
      role: z.enum(users.role.enumValues),
      isActive: z
        .union([z.literal("on"), z.literal("true"), z.null()])
        .optional()
        .transform((v) => v === "on" || v === "true"),
    })
    .safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, ...values } = parsed.data;

  const existing = id
    ? await db.query.users.findFirst({
        where: and(
          eq(users.id, id),
          eq(users.organizationId, session.organizationId),
        ),
      })
    : null;
  if (id && !existing) return { ok: false, error: "User not found" };

  // An organization with nobody who can reach Admin is an organization nobody
  // can fix from inside the app.
  if (existing?.role === "admin" && (values.role !== "admin" || !values.isActive)) {
    const guard = await lastAdminGuard(session.organizationId, existing.id);
    if (guard) return { ok: false, error: guard };
  }

  // Somebody who has never signed in needs the email; somebody whose address
  // was corrected needs it at the new one. An existing, linked account does
  // not — re-inviting them would just be noise.
  const needsInvite = !existing || (!existing.clerkUserId && existing.email !== values.email);
  const invite = needsInvite && values.isActive
    ? await sendInvitation(values.email)
    : null;

  const row = {
    ...values,
    ...(invite?.sent ? { invitedAt: new Date(), inviteUrl: invite.url } : {}),
  };

  if (id) {
    await db
      .update(users)
      .set(row)
      .where(
        and(eq(users.id, id), eq(users.organizationId, session.organizationId)),
      );
  } else {
    await db
      .insert(users)
      .values({ ...row, organizationId: session.organizationId });
  }
  revalidatePath("/admin/users");

  // The CRM row is written either way — a failed invitation is a warning to
  // act on, never a reason to lose the person's role and organization.
  if (invite && !invite.sent && invite.reason === "failed") {
    return {
      ok: true,
      data: { inviteWarning: `Saved, but the invitation email failed: ${invite.message}` },
    };
  }
  return { ok: true, data: invite?.sent ? { invited: true } : {} };
}

/**
 * Suspend or restore someone.
 *
 * Suspending is the normal way to remove a person: `requireSession()` only
 * accepts an active row, so they cannot sign in, and `getMasterData()` only
 * lists active users, so they leave the Deal Owner dropdowns — while every
 * deal they ever closed keeps their name on it.
 */
export async function setUserActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const session = await requireAdmin();
  if (id === session.userId) {
    return { ok: false, error: "You cannot suspend your own account" };
  }
  const target = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.organizationId, session.organizationId)),
  });
  if (!target) return { ok: false, error: "User not found" };

  if (!isActive && target.role === "admin") {
    const guard = await lastAdminGuard(session.organizationId, id);
    if (guard) return { ok: false, error: guard };
  }

  await db
    .update(users)
    .set({ isActive })
    .where(
      and(eq(users.id, id), eq(users.organizationId, session.organizationId)),
    );
  revalidatePath("/admin/users");
  revalidatePath("/pipeline");
  return { ok: true };
}

/**
 * Delete someone outright.
 *
 * Only for a row that owns nothing — a wrong address typed in, a person who
 * never started. Once they own a deal their name is part of that deal's
 * history, and `owner_user_id` is ON DELETE RESTRICT precisely so the database
 * refuses to erase it. Suspending is the answer in that case, and the error
 * says so rather than leaving an admin staring at a constraint violation.
 */
export async function deleteUser(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (id === session.userId) {
    return { ok: false, error: "You cannot delete your own account" };
  }
  const target = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.organizationId, session.organizationId)),
  });
  if (!target) return { ok: false, error: "User not found" };

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.organizationId, session.organizationId),
        eq(opportunities.ownerUserId, id),
      ),
    );
  if (count > 0) {
    return {
      ok: false,
      error: `${target.name} owns ${count} ${count === 1 ? "deal" : "deals"}. Suspend them instead, or hand those deals to someone else first.`,
    };
  }

  if (target.role === "admin") {
    const guard = await lastAdminGuard(session.organizationId, id);
    if (guard) return { ok: false, error: guard };
  }

  await db
    .delete(users)
    .where(
      and(eq(users.id, id), eq(users.organizationId, session.organizationId)),
    );
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Send the sign-up email again to somebody who has not signed in yet. */
export async function resendInvite(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const target = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.organizationId, session.organizationId)),
  });
  if (!target) return { ok: false, error: "User not found" };
  if (target.clerkUserId) {
    return { ok: false, error: `${target.name} has already signed in` };
  }

  const invite = await sendInvitation(target.email);
  if (!invite.sent && invite.reason === "failed") {
    return { ok: false, error: invite.message };
  }
  await db
    .update(users)
    .set({
      invitedAt: new Date(),
      ...(invite.sent ? { inviteUrl: invite.url } : {}),
    })
    .where(eq(users.id, id));
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Returns an error message if this change would leave no active admin. */
async function lastAdminGuard(organizationId: string, excludingUserId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.role, "admin"),
        eq(users.isActive, true),
        sql`${users.id} <> ${excludingUserId}`,
      ),
    );
  return count > 0
    ? null
    : "That would leave nobody able to reach Admin. Make someone else an admin first.";
}

const masterTables = { cities: cityTable, vehicleTypes, lostReasons } as const;
type MasterTable = keyof typeof masterTables;

export async function upsertMasterItem(
  table: MasterTable,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = z
    .object({
      id: uuidish,
      label: z.string().trim().min(1).max(80),
      isActive: z
        .union([z.literal("on"), z.literal("true"), z.null()])
        .optional()
        .transform((v) => v !== null && v !== undefined),
    })
    .safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: "Name is required" };

  const { id, label, isActive } = parsed.data;
  const t = masterTables[table];
  const nameColumn = table === "lostReasons" ? "label" : "name";

  if (id) {
    await db
      .update(t)
      .set({ [nameColumn]: label, isActive } as never)
      .where(and(eq(t.id, id), eq(t.organizationId, session.organizationId)));
  } else {
    await db
      .insert(t)
      .values({
        organizationId: session.organizationId,
        [nameColumn]: label,
      } as never);
  }
  revalidatePath("/admin/master-data");
  return { ok: true };
}

/**
 * Rewrite the display order of a master-data list.
 *
 * The client sends the whole new order rather than "move this one up", so the
 * result cannot end up with ties or gaps, and two admins reordering at once
 * leave a list that is at least internally consistent.
 *
 * One UPDATE ... FROM (VALUES ...) rather than a row-at-a-time loop: it is a
 * single statement, so it is atomic on both the Neon HTTP driver and plain
 * node-postgres, and the org check sits inside it.
 */
export async function reorderMasterItems(
  table: MasterTable,
  ids: string[],
): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = z.array(z.string().uuid()).min(1).max(500).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid order" };

  const t = masterTables[table];
  const values = sql.join(
    // Both columns are cast explicitly: an untyped parameter in a VALUES list
    // defaults to text, and "sort_order is integer but expression is text"
    // fails at runtime, not at build.
    parsed.data.map((id, i) => sql`(${id}::uuid, ${i}::int)`),
    sql`, `,
  );
  await db.execute(sql`
    update ${t} as m
    set sort_order = v.ord
    from (values ${values}) as v(id, ord)
    where m.id = v.id and m.organization_id = ${session.organizationId}
  `);

  revalidatePath("/admin/master-data");
  // The order is what Quick Add and the deal form read from.
  revalidatePath("/pipeline");
  return { ok: true };
}

/* ------------------------------------------------------------------ helpers */

async function loadOwned(organizationId: string, id: string) {
  return db.query.opportunities.findFirst({
    where: and(
      eq(opportunities.id, id),
      eq(opportunities.organizationId, organizationId),
    ),
  });
}

async function assertOrgUser(organizationId: string, userId: string) {
  const row = await db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.organizationId, organizationId)),
  });
  if (!row) throw new Error("FORBIDDEN");
  return row.id;
}

/* -------------------------------------------------------------------- leads */

const leadInput = z.object({
  enquiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date the enquiry came in"),
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  typeOfGoods: z.string().trim().max(200).nullable().optional(),
  vehicleRequirement: z.coerce.number().int().min(1).max(100_000).nullable().optional(),
  callingCity: z.string().trim().max(120).nullable().optional(),
  vehicleType: z.string().trim().max(120).nullable().optional(),
  callerName: z.string().trim().max(160).nullable().optional(),
  designation: z.string().trim().max(160).nullable().optional(),
  mobile: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  foundOn: z.string().trim().max(160).nullable().optional(),
});

/**
 * The same fields plus what the caller said.
 *
 * Only the create form asks for it. `updateLead` deliberately keeps the
 * narrower schema: its form does not carry a remarks field, and
 * `formToObject` reads a missing field as null — which would wipe the remark
 * a deal owner left behind on their call.
 */
const newLeadInput = leadInput.extend({
  remarks: z.string().trim().max(2000).nullable().optional(),
});

/**
 * The NOC desk writing down a call.
 *
 * Only the company and the date are required. Somebody who rings off before
 * giving their fleet size still happened, and a form that refuses to save
 * that teaches people to invent numbers.
 */
export async function createLead(formData: FormData): Promise<ActionResult> {
  const session = await requireLeads();
  const parsed = newLeadInput.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.insert(leads).values({
    organizationId: session.organizationId,
    ...parsed.data,
    createdByUserId: session.userId,
  });

  revalidatePath("/leads");
  return { ok: true };
}

/** Correcting what was written down. The status is not touched here. */
export async function updateLead(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireLeads();
  const parsed = leadInput.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await db
    .update(leads)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.organizationId, session.organizationId)))
    .returning();
  if (!result.length) return { ok: false, error: "Lead not found" };

  revalidatePath("/leads");
  return { ok: true };
}

/**
 * A deal owner, back from the call.
 *
 * The remark is the point of this screen, so it is required either way: a
 * status with no sentence behind it tells the next person nothing. Saying no
 * additionally needs a reason, which the database insists on too.
 *
 * `converted` is not settable here — it is what `convertLead` writes when a
 * deal actually exists, so the word never gets ahead of the fact.
 */
export async function actionLead(
  id: string,
  input: { status: "qualified" | "not_qualified"; remarks: string; reason?: string },
): Promise<ActionResult> {
  const session = await requireDealOwner();

  const remarks = input.remarks.trim();
  if (!remarks) {
    return { ok: false, error: "Say what they told you — one line is enough." };
  }
  const reason = input.reason?.trim() ?? "";
  if (input.status === "not_qualified" && !reason) {
    return { ok: false, error: "Give the reason this is not a deal." };
  }

  const existing = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.organizationId, session.organizationId)),
  });
  if (!existing) return { ok: false, error: "Lead not found" };
  if (existing.status === "converted") {
    return {
      ok: false,
      error: "This lead is already a deal — work it in the pipeline from here.",
    };
  }

  await db
    .update(leads)
    .set({
      status: input.status,
      remarks,
      notQualifiedReason: input.status === "not_qualified" ? reason : null,
      actionedByUserId: session.userId,
      actionedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, id), eq(leads.organizationId, session.organizationId)));

  revalidatePath("/leads");
  return { ok: true };
}

/**
 * The lead becomes a deal.
 *
 * The enquiry says "3W" and "Bangalore"; a deal needs a vehicle type and a
 * city from the master lists, so the form asks rather than guessing — a deal
 * created against the wrong model is worse than one more question.
 *
 * Everything the enquiry knows about the person who rang travels into the
 * deal's notes, because a deal has nowhere else to put a phone number, and
 * losing it at exactly the moment the deal starts would be perverse.
 */
export async function convertLead(
  id: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireDealOwner();

  const existing = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.organizationId, session.organizationId)),
  });
  if (!existing) return { ok: false, error: "Lead not found" };
  if (existing.status === "converted" && existing.opportunityId) {
    return { ok: false, error: "This lead is already a deal." };
  }

  const contact = [
    existing.callerName
      ? `Contact: ${existing.callerName}${existing.designation ? `, ${existing.designation}` : ""}`
      : null,
    existing.mobile ? `Mobile: ${existing.mobile}` : null,
    existing.email ? `Email: ${existing.email}` : null,
    existing.typeOfGoods ? `Goods: ${existing.typeOfGoods}` : null,
    existing.foundOn ? `Found MoEVing on: ${existing.foundOn}` : null,
    existing.callingCity ? `Calling city as given: ${existing.callingCity}` : null,
    existing.vehicleType ? `Vehicle asked for: ${existing.vehicleType}` : null,
    existing.remarks ? `Call remarks: ${existing.remarks}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // The deal is raised through the ordinary path, so every rule the Quick Add
  // sheet enforces — the city check, the owner rule, the multi-city split —
  // applies to a converted lead exactly as it does to a typed one.
  formData.set("accountName", existing.companyName);
  if (!formData.get("notes")) formData.set("notes", contact);
  const created = await createOpportunity(formData);
  if (!created.ok) return created;

  const opportunityId = created.data!.id;
  const now = new Date();
  await db
    .update(leads)
    .set({
      status: "converted",
      opportunityId,
      notQualifiedReason: null,
      convertedAt: now,
      // `actionedAt` is deliberately left alone. It marks the callback — how
      // long the enquiry waited for somebody to ring it — and overwriting it
      // here erased exactly the number the desk is measured on. A lead
      // converted on the same call still has both: `actionedAt` from the
      // qualifying, or null if it went straight from new to a deal.
      updatedAt: now,
    })
    .where(and(eq(leads.id, id), eq(leads.organizationId, session.organizationId)));

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  return { ok: true, data: { id: opportunityId } };
}
