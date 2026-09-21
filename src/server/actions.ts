"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  accounts,
  cities as cityTable,
  lostReasons,
  opportunities,
  opportunityEvents,
  salesStage,
  users,
  vehicleTypes,
} from "@/db/schema";
import type { SalesStage } from "@/db/schema";
import { requireAdmin, requireSession } from "@/server/auth";
import { sendInvitation } from "@/server/invites";
import { planStageChange } from "@/server/stage-change";

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
  /** Set when this deal grew out of an earlier one — see § repeat business. */
  parentOpportunityId: uuidish,
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

  // A parent id comes off a form, so it is checked against this organization
  // before it is trusted, like every other id crossing the wire.
  let parentOpportunityId: string | null = null;
  if (input.parentOpportunityId) {
    const parent = await loadOwned(
      session.organizationId,
      input.parentOpportunityId,
    );
    if (!parent) return { ok: false, error: "That original deal no longer exists" };
    parentOpportunityId = parent.id;
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
        parentOpportunityId,
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

  // The original deal's timeline should say the customer came back, or the
  // repeat order is only visible from the new deal looking backwards.
  if (parentOpportunityId) {
    await db.insert(opportunityEvents).values({
      organizationId: session.organizationId,
      opportunityId: parentOpportunityId,
      userId: session.userId,
      kind: "note",
      body:
        created.length > 1
          ? `Follow-on deployment: ${created.length} new deals opened for this customer.`
          : `Follow-on deployment opened: ${created[0]!.name} (${created[0]!.fleetSize} vehicles).`,
    });
    revalidatePath(`/opportunities/${parentOpportunityId}`);
  }

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

/**
 * The one-tap path from the pipeline. Won and Lost need their extra block;
 * every other stage moves with no questions asked.
 *
 * The decision — noop, ask for the block, or here is the patch — lives in
 * `stage-change.ts` so it can be tested without Next, Clerk or a database.
 */
export async function changeStage(
  id: string,
  stage: SalesStage,
  formData?: FormData,
): Promise<ActionResult<{ needs?: "won" | "lost" }>> {
  const session = await requireSession();
  const existing = await loadOwned(session.organizationId, id);
  if (!existing) return { ok: false, error: "Opportunity not found" };

  const plan = planStageChange({
    from: existing.stage,
    to: stage,
    fields: formData ? formToObject(formData) : {},
  });
  if (plan.type === "noop") return { ok: true };
  if (plan.type === "needs") return { ok: true, data: { needs: plan.needs } };

  const patch: Partial<typeof opportunities.$inferInsert> = { ...plan.patch };

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
    ...(invite?.sent ? { invitedAt: new Date() } : {}),
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
    .set({ invitedAt: new Date() })
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
