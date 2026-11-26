"use server";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { leadIntakeKeys } from "@/db/schema";
import { KEY_PREFIX } from "@/lib/inbound-lead";
import { requireAdmin } from "@/server/auth";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * A new key for the website chatbot.
 *
 * The key is returned ONCE, to be copied into the chatbot's settings; only
 * its SHA-256 is kept, so it cannot be shown again. Lost it? Make another and
 * revoke this one.
 */
export async function createIntakeKey(label: string): Promise<Result<{ key: string }>> {
  const session = await requireAdmin();
  const parsed = z.string().trim().min(1, "Give the key a name").max(80).safeParse(label);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const key = KEY_PREFIX + randomBytes(30).toString("base64url");
  await db.insert(leadIntakeKeys).values({
    organizationId: session.organizationId,
    label: parsed.data,
    keyHash: createHash("sha256").update(key).digest("hex"),
    keyPrefix: key.slice(0, KEY_PREFIX.length + 6),
    createdByUserId: session.userId,
  });

  revalidatePath("/admin/website-leads");
  return { ok: true, data: { key } };
}

/** Stops a key working at once. The row stays, so its history does. */
export async function revokeIntakeKey(id: string): Promise<Result> {
  const session = await requireAdmin();
  const result = await db
    .update(leadIntakeKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(leadIntakeKeys.id, id),
        eq(leadIntakeKeys.organizationId, session.organizationId),
        isNull(leadIntakeKeys.revokedAt),
      ),
    )
    .returning();
  if (!result.length) return { ok: false, error: "That key is not active." };

  revalidatePath("/admin/website-leads");
  return { ok: true };
}
