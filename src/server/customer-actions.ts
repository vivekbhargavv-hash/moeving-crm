"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { accounts } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import type { ActionResult } from "@/server/actions";

/**
 * Deletes a customer that nothing hangs off — a name typed wrong, or one
 * whose only deal was deleted.
 *
 * Admin only (Vivek, 8 Oct). Refused while the customer has ANY deal, open,
 * won or lost: a deal is history, and a customer is how it is found. Also
 * refused while it holds agreements, because deleting a customer must never
 * be the way a signed contract quietly disappears — those are deleted one by
 * one, on purpose, from the customer's page.
 *
 * The database backs both rules (`ON DELETE RESTRICT` from deals and from
 * agreements), so a deal raised between the check and the delete makes the
 * delete fail rather than succeed.
 */
export async function deleteCustomer(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const mine = and(eq(accounts.id, id), eq(accounts.organizationId, session.organizationId));

  const [row] = await db
    .select({
      name: accounts.name,
      deals: sql<number>`(select count(*)::int from "opportunities" where "opportunities"."account_id" = "accounts"."id")`,
      papers: sql<number>`(select count(*)::int from "agreements" where "agreements"."account_id" = "accounts"."id")`,
    })
    .from(accounts)
    .where(mine);
  if (!row) return { ok: false, error: "That customer was already deleted." };

  const deals = Number(row.deals);
  const papers = Number(row.papers);
  if (deals > 0) {
    return {
      ok: false,
      error: `${row.name} has ${deals} ${deals === 1 ? "deal" : "deals"}. Only a customer with no deals can be deleted.`,
    };
  }
  if (papers > 0) {
    return {
      ok: false,
      error: `${row.name} has ${papers} signed ${papers === 1 ? "agreement" : "agreements"}. Delete ${papers === 1 ? "it" : "them"} on the customer's page first.`,
    };
  }

  try {
    await db.delete(accounts).where(mine);
  } catch {
    return {
      ok: false,
      error: `${row.name} was given a deal or an agreement a moment ago, so it was not deleted.`,
    };
  }

  revalidatePath("/customers");
  return { ok: true };
}
