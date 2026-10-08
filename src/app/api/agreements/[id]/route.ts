import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { agreements } from "@/db/schema";
import { requireSession } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * Opens one signed agreement.
 *
 * The store is private, so the file's own address opens for nobody; this is
 * the only way to it. The agreement carries the price, so it is refused to
 * ops and NOC the way every commercial screen is, and the row is looked up
 * inside the caller's organization before the store is asked for anything.
 *
 * `?download=1` saves it instead of opening it in the browser.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "sales") {
    return new Response("Not available for this role", { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const [row] = await db
    .select({
      blobUrl: agreements.blobUrl,
      fileName: agreements.fileName,
      contentType: agreements.contentType,
    })
    .from(agreements)
    .where(
      and(eq(agreements.id, id), eq(agreements.organizationId, session.organizationId)),
    );
  if (!row) return new Response("Not found", { status: 404 });

  const file = await get(row.blobUrl, { access: "private" });
  if (!file || file.statusCode !== 200) {
    return new Response("The file is missing from storage.", { status: 404 });
  }

  const download = new URL(request.url).searchParams.has("download");
  // RFC 6266: a plain ASCII fallback, and the real name for browsers that read it.
  const ascii = row.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(file.stream, {
    headers: {
      "Content-Type": row.contentType || file.blob.contentType || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      // A signed contract must not sit in a shared cache, or in a phone's
      // cache after the person loses access.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
