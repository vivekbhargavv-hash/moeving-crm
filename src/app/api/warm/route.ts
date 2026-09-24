import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Wakes the database, and this server function, before the next tap needs them.
 *
 * Neon's free plan suspends the database after ~5 minutes idle and the suspend
 * time cannot be changed on it (HANDOFF § 0), so the first screen after a
 * pause used to wait a second or more for it to start. The shell calls this
 * while somebody is actually using the app (`lib/use-keep-warm.ts`).
 *
 * Signed-in only, checked from the Clerk token alone: an anonymous caller must
 * not be able to hold the database awake and spend its compute allowance.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response(null, { status: 401 });
  try {
    await db.execute(sql`select 1`);
  } catch {
    /* A failed warm-up costs nobody anything; the next page will retry. */
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
