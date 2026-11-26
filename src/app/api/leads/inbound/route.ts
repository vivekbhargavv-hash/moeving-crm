import { createHash } from "node:crypto";

import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { db } from "@/db";
import { leadIntakeKeys, leads, users } from "@/db/schema";
import { keyFromRequest, parseInboundLead } from "@/lib/inbound-lead";
import { leadId } from "@/lib/record-ids";
import { todayInIndia } from "@/lib/utils";
import { pushToUser } from "@/server/push";

export const dynamic = "force-dynamic";

/**
 * Leads from the website chatbot (Vivek, 26 Nov).
 *
 * `POST /api/leads/inbound` with a key made in Admin → Website leads, sent as
 * `Authorization: Bearer <key>`, an `X-API-Key` header, or `?key=<key>` on the
 * URL (for tools that can only be given a web address). JSON or form fields;
 * the field names are in docs/website-leads-api.md and `lib/inbound-lead.ts`.
 *
 * This is the one door to a tenant that is not `requireSession()`: there is
 * no person signed in, so the KEY names the organization. Everything else
 * follows the desk's rules — the lead lands as New, with no owner, and every
 * admin's phone is told so they can assign it.
 */

const MAX_BYTES = 64 * 1024;
/** A chatbot that retries a webhook must not make two leads of one visitor. */
const DUPLICATE_WINDOW_MINUTES = 30;

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function keyRow(request: Request) {
  const key = keyFromRequest(request.headers, new URL(request.url));
  if (!key) return null;
  const [row] = await db
    .select()
    .from(leadIntakeKeys)
    .where(and(eq(leadIntakeKeys.keyHash, sha256(key)), isNull(leadIntakeKeys.revokedAt)))
    .limit(1);
  return row ?? null;
}

const NO_KEY = {
  ok: false,
  error: "Missing or invalid key. Make one in the CRM under Admin → Website leads.",
};

/** A connection test: some tools ping the address before they send to it. */
export async function GET(request: Request) {
  const key = await keyRow(request);
  if (!key) return reply(401, NO_KEY);
  return reply(200, { ok: true, message: "Key accepted. POST leads to this address." });
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("content-type") ?? "";
  const textBody = await request.text();
  if (textBody.length > MAX_BYTES) throw new RangeError("too big");
  if (!textBody.trim()) return null;

  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(textBody));
  }
  if (type.includes("multipart/form-data")) {
    const form = await new Response(textBody, { headers: { "content-type": type } }).formData();
    const out: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
    return out;
  }
  // JSON, whatever the header says — plenty of tools send it as text/plain.
  try {
    const parsed: unknown = JSON.parse(textBody);
    if (Array.isArray(parsed)) {
      // Some webhooks wrap a single record in a list.
      return parsed.length === 1 && parsed[0] && typeof parsed[0] === "object"
        ? (parsed[0] as Record<string, unknown>)
        : null;
    }
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const key = await keyRow(request);
  if (!key) return reply(401, NO_KEY);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return reply(413, { ok: false, error: "A lead must be under 64 KB." });
  }
  let body: Record<string, unknown> | null;
  try {
    body = await readBody(request);
  } catch {
    return reply(413, { ok: false, error: "A lead must be under 64 KB." });
  }
  if (!body) {
    return reply(400, {
      ok: false,
      error: "Send the lead as a JSON object or as form fields.",
    });
  }

  const parsed = parseInboundLead(body, todayInIndia());
  if (!parsed.ok) return reply(422, { ok: false, error: parsed.error });
  const lead = parsed.lead;
  const organizationId = key.organizationId;

  // The same visitor posted again within half an hour: a retried webhook, or
  // a chatbot that sends at every step. Answer as if accepted, add nothing.
  const sameContact = [
    lead.mobile ? eq(leads.mobile, lead.mobile) : undefined,
    lead.email ? sql`lower(${leads.email}) = ${lead.email}` : undefined,
  ].filter((c) => c !== undefined);
  const [duplicate] = await db
    .select({ id: leads.id, ref: leads.ref })
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, organizationId),
        eq(leads.source, "website"),
        gte(
          leads.createdAt,
          sql`now() - make_interval(mins => ${DUPLICATE_WINDOW_MINUTES})`,
        ),
        or(...sameContact),
      ),
    )
    .limit(1);
  if (duplicate) {
    return reply(200, { ok: true, duplicate: true, id: leadId(duplicate.ref) });
  }

  const [created] = await db
    .insert(leads)
    .values({ organizationId, ...lead, source: "website" })
    .returning();

  await db
    .update(leadIntakeKeys)
    .set({
      lastUsedAt: new Date(),
      leadsReceived: sql`${leadIntakeKeys.leadsReceived} + 1`,
    })
    .where(eq(leadIntakeKeys.id, key.id));

  revalidatePath("/leads");

  // After the reply: the chatbot should not wait on anybody's phone.
  after(async () => {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.organizationId, organizationId),
          eq(users.role, "admin"),
          eq(users.isActive, true),
        ),
      );
    const headline = [
      lead.companyName,
      lead.callingCity,
      lead.vehicleRequirement
        ? `${lead.vehicleRequirement} × ${lead.vehicleType ?? "vehicle"}`
        : lead.vehicleType,
    ]
      .filter(Boolean)
      .join(" · ");
    await Promise.all(
      admins.map((a) =>
        pushToUser(organizationId, a.id, {
          title: `Website lead: ${headline}`,
          body:
            [lead.callerName, lead.mobile ?? lead.email].filter(Boolean).join(" · ") ||
            "Assign it on the Leads screen",
          url: `/leads?lead=${created!.id}`,
          callUrl: lead.mobile ? `/leads?lead=${created!.id}&call=1` : undefined,
          tag: `lead-${created!.id}`,
        }).catch(() => {
          /* Best effort — the lead is on the Leads screen regardless. */
        }),
      ),
    );
  });

  return reply(201, { ok: true, id: leadId(created!.ref) });
}
