"use server";

import { del, head } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  accounts,
  agreementType,
  agreements,
  opportunities,
  opportunityEvents,
} from "@/db/schema";
import {
  AGREEMENT_CONTENT_TYPES,
  AGREEMENT_MAX_BYTES,
  AGREEMENT_TYPE_LABEL,
  agreementFolder,
  isInFolder,
} from "@/lib/agreements";
import { formatDate } from "@/lib/utils";
import { requireDealOwner } from "@/server/auth";
import type { ActionResult } from "@/server/actions";

/*
 * Signed customer agreements. Every deal owner and admin may upload, edit and
 * delete them (Vivek, Oct 2026); ops and NOC are refused, because an
 * agreement carries the price. `requireDealOwner()` is the same door the
 * deal actions use — an action is its own door, whatever the page did.
 */

/** A real calendar day, with a message that names the field. */
const day = (message: string) =>
  z
    .string({ error: message })
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, "That is not a real date");

const details = z
  .object({
    type: z.enum(agreementType.enumValues, { error: "Pick what kind of agreement it is" }),
    signedOn: day("When was it signed?"),
    renewalOn: day("When is it up for renewal?"),
    opportunityId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    notes: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .refine((v) => v.renewalOn >= v.signedOn, {
    message: "The renewal date cannot be before it was signed",
  });

const newAgreement = z.object({
  accountId: z.string().uuid(),
  pathname: z.string().min(1).max(600),
  fileName: z.string().trim().min(1).max(200),
});

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the details and try again.";
}

/** The deal must be this customer's — never another customer's, or org's. */
async function dealBelongs(
  organizationId: string,
  accountId: string,
  opportunityId: string | null,
) {
  if (!opportunityId) return true;
  const [row] = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.id, opportunityId),
        eq(opportunities.organizationId, organizationId),
        eq(opportunities.accountId, accountId),
      ),
    );
  return Boolean(row);
}

function revalidate(accountId: string, opportunityId: string | null) {
  revalidatePath("/customers");
  revalidatePath(`/customers/${accountId}`);
  revalidatePath("/pipeline");
  if (opportunityId) revalidatePath(`/opportunities/${opportunityId}`);
}

/** A line on the deal's timeline, so the paper shows up where the deal is read. */
async function noteOnDeal(
  organizationId: string,
  userId: string,
  opportunityId: string | null,
  body: string,
) {
  if (!opportunityId) return;
  await db.insert(opportunityEvents).values({
    organizationId,
    opportunityId,
    userId,
    kind: "note",
    body,
  });
}

/**
 * Records an agreement whose file the browser has just uploaded.
 *
 * Nothing about the file is taken on trust. The path must sit in this
 * organization's folder for this customer, and the store itself is asked what
 * is there — its size and type — rather than believing what the form said.
 */
export async function createAgreement(input: unknown): Promise<ActionResult> {
  const session = await requireDealOwner();
  const file = newAgreement.safeParse(input);
  const meta = details.safeParse(input);
  if (!file.success) return { ok: false, error: "Upload the file again." };
  if (!meta.success) return { ok: false, error: firstError(meta.error) };
  const { accountId, pathname, fileName } = file.data;

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.id, accountId), eq(accounts.organizationId, session.organizationId)),
    );
  if (!account) return { ok: false, error: "That customer was not found." };
  if (!isInFolder(pathname, agreementFolder(session.organizationId, accountId))) {
    return { ok: false, error: "Upload the file again." };
  }
  if (!(await dealBelongs(session.organizationId, accountId, meta.data.opportunityId))) {
    return { ok: false, error: "That deal is not this customer's." };
  }

  let stored: Awaited<ReturnType<typeof head>>;
  try {
    stored = await head(pathname);
  } catch {
    return { ok: false, error: "The upload did not finish. Try again." };
  }
  if (stored.size > AGREEMENT_MAX_BYTES || !AGREEMENT_CONTENT_TYPES.includes(stored.contentType)) {
    await del(stored.url).catch(() => {});
    return { ok: false, error: "Upload a PDF, a photo or a Word file, 25 MB at most." };
  }

  await db.insert(agreements).values({
    organizationId: session.organizationId,
    accountId,
    ...meta.data,
    blobUrl: stored.url,
    blobPathname: stored.pathname,
    fileName,
    contentType: stored.contentType,
    sizeBytes: stored.size,
    uploadedByUserId: session.userId,
  });

  await noteOnDeal(
    session.organizationId,
    session.userId,
    meta.data.opportunityId,
    `Agreement uploaded: ${AGREEMENT_TYPE_LABEL[meta.data.type]} signed ${formatDate(meta.data.signedOn)}, renews ${formatDate(meta.data.renewalOn)}.`,
  );

  revalidate(accountId, meta.data.opportunityId);
  return { ok: true };
}

/** Corrects the type, dates, deal or note. The file itself stays. */
export async function updateAgreement(id: string, input: unknown): Promise<ActionResult> {
  const session = await requireDealOwner();
  const meta = details.safeParse(input);
  if (!meta.success) return { ok: false, error: firstError(meta.error) };

  const [row] = await db
    .select({ accountId: agreements.accountId, opportunityId: agreements.opportunityId })
    .from(agreements)
    .where(and(eq(agreements.id, id), eq(agreements.organizationId, session.organizationId)));
  if (!row) return { ok: false, error: "That agreement was not found." };
  if (!(await dealBelongs(session.organizationId, row.accountId, meta.data.opportunityId))) {
    return { ok: false, error: "That deal is not this customer's." };
  }

  await db
    .update(agreements)
    .set(meta.data)
    .where(and(eq(agreements.id, id), eq(agreements.organizationId, session.organizationId)));

  revalidate(row.accountId, meta.data.opportunityId);
  if (row.opportunityId && row.opportunityId !== meta.data.opportunityId) {
    revalidatePath(`/opportunities/${row.opportunityId}`);
  }
  return { ok: true };
}

/**
 * Deletes the record and the file. The row goes first: a file left behind by
 * a failed delete costs a few kilobytes of storage, while a row pointing at a
 * deleted file would be a contract the app claims to hold and cannot open.
 */
export async function deleteAgreement(id: string): Promise<ActionResult> {
  const session = await requireDealOwner();
  const mine = and(eq(agreements.id, id), eq(agreements.organizationId, session.organizationId));
  const [row] = await db
    .select({
      accountId: agreements.accountId,
      opportunityId: agreements.opportunityId,
      blobUrl: agreements.blobUrl,
      type: agreements.type,
      fileName: agreements.fileName,
    })
    .from(agreements)
    .where(mine);
  if (!row) return { ok: false, error: "That agreement was already deleted." };
  await db.delete(agreements).where(mine);

  await del(row.blobUrl).catch(() => {
    /* An orphaned file is harmless; the record is what the app trusts. */
  });
  await noteOnDeal(
    session.organizationId,
    session.userId,
    row.opportunityId,
    `Agreement deleted: ${AGREEMENT_TYPE_LABEL[row.type]} (${row.fileName}).`,
  );

  revalidate(row.accountId, row.opportunityId);
  return { ok: true };
}
