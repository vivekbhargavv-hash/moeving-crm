"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  accounts,
  cities as cityTable,
  lostReasons,
  opportunities,
  opportunityEvents,
  users,
  vehicleTypes,
} from "@/db/schema";
import type { SalesStage } from "@/db/schema";
import { requireAdmin, requireSession } from "@/server/auth";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const money = z.coerce.number().int().min(0).max(2_000_000_000);
// formToObject() already turns empty strings into null.
const optionalMoney = z
  .union([money, z.null()])
  .optional()
  .transform((v) => v ?? null);

const uuidish = z
  .string()
  .uuid()
  .or(z.literal("").transform(() => null))
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const stageEnum = z.enum([
  "first_contact",
  "solutioning",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
  "dormant",
]);

/** "2026-10" -> "2026-10-31". The team thinks in months, the database in dates. */
function monthToLastDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

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
  expectedCloseMonth: closeMonth,
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
  const session = await requireSession();
  const parsed = baseOpportunity.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  // Sales users always own what they create; only an admin may assign.
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
  // a salesperson say that once instead of filling the sheet three times.
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
  const session = await requireSession();
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

  await db
    .update(opportunities)
    .set({
      accountId,
      name: input.name?.trim() || input.accountName.trim(),
      cityId: input.cityId,
      vehicleTypeId: input.vehicleTypeId,
      driverType: input.driverType ?? null,
      chargingScope: input.chargingScope ?? null,
      fleetSize: input.fleetSize,
      price: input.price,
      expectedCloseDate: input.expectedCloseMonth,
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

  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/pipeline");
  revalidatePath("/forecast");
  revalidatePath("/dashboard");
  return { ok: true };
}

/* ------------------------------------------------------------ stage change */

const closeWonSchema = z.object({
  revenue: money,
  leaseCost: money,
  driverCost: money,
  chargingCost: money,
  parkingCost: money,
  maintenanceCost: money,
  supervisorCost: money,
  miscCost: money,
});

const closeLostSchema = z.object({
  lostReasonId: z.string().uuid("Pick a reason"),
  lostReasonNote: z.string().trim().max(1000).nullable().optional(),
});

/**
 * The one-tap path from the pipeline. Won and Lost need their extra block;
 * every other stage moves with no questions asked.
 */
export async function changeStage(
  id: string,
  stage: SalesStage,
  formData?: FormData,
): Promise<ActionResult<{ needs?: "won" | "lost" }>> {
  const session = await requireSession();
  const existing = await loadOwned(session.organizationId, id);
  if (!existing) return { ok: false, error: "Opportunity not found" };
  if (existing.stage === stage) return { ok: true };

  const patch: Partial<typeof opportunities.$inferInsert> = {
    stage,
    updatedAt: new Date(),
    closedAt:
      stage === "closed_won" || stage === "closed_lost" ? new Date() : null,
  };

  if (stage === "closed_won") {
    const parsed = closeWonSchema.safeParse(
      formData ? formToObject(formData) : {},
    );
    if (!parsed.success) return { ok: true, data: { needs: "won" } };
    Object.assign(patch, parsed.data);
  }

  if (stage === "closed_lost") {
    const parsed = closeLostSchema.safeParse(
      formData ? formToObject(formData) : {},
    );
    if (!parsed.success) return { ok: true, data: { needs: "lost" } };
    const reason = await db.query.lostReasons.findFirst({
      where: and(
        eq(lostReasons.id, parsed.data.lostReasonId),
        eq(lostReasons.organizationId, session.organizationId),
      ),
    });
    if (!reason) return { ok: false, error: "Unknown reason" };
    patch.lostReasonId = reason.id;
    patch.lostReasonNote = parsed.data.lostReasonNote ?? null;
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
  const session = await requireSession();
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

export async function deleteOpportunity(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const existing = await loadOwned(session.organizationId, id);
  if (!existing) return { ok: false, error: "Opportunity not found" };
  if (session.role !== "admin" && existing.ownerUserId !== session.userId) {
    return { ok: false, error: "Only the deal owner or an admin can delete this" };
  }
  await db
    .delete(opportunities)
    .where(
      and(
        eq(opportunities.id, id),
        eq(opportunities.organizationId, session.organizationId),
      ),
    );
  revalidatePath("/pipeline");
  return { ok: true };
}

/* -------------------------------------------------------------------- admin */

export async function upsertUser(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = z
    .object({
      id: uuidish,
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().toLowerCase(),
      role: z.enum(["admin", "sales"]),
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

  if (id) {
    await db
      .update(users)
      .set(values)
      .where(
        and(eq(users.id, id), eq(users.organizationId, session.organizationId)),
      );
  } else {
    await db
      .insert(users)
      .values({ ...values, organizationId: session.organizationId });
  }
  revalidatePath("/admin/users");
  return { ok: true };
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
