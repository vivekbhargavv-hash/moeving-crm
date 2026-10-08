import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { accounts } from "@/db/schema";
import {
  AGREEMENT_CONTENT_TYPES,
  AGREEMENT_MAX_BYTES,
  agreementFolder,
  isInFolder,
} from "@/lib/agreements";
import { requireSession } from "@/server/auth";
import { blobUploadProblem } from "@/server/blob-config";

export const dynamic = "force-dynamic";

/**
 * Hands the browser a short-lived token to upload ONE agreement file
 * straight to the private blob store.
 *
 * Straight to the store, not through this server: a Vercel function refuses
 * a request body over 4.5 MB, and a scanned contract is routinely bigger. The
 * file never passes through here — only the question "may this person put a
 * file in this customer's folder?", which is answered from the session:
 *
 * - a deal owner or an admin (Vivek: every deal owner may upload);
 * - of this organization, for a customer of this organization;
 * - into `agreements/<org>/<customer>/`, and nowhere else;
 * - a PDF, photo or Word file, 25 MB at most, valid for ten minutes.
 *
 * The agreement row itself is written afterwards by `createAgreement`, which
 * checks the folder again — this token being issued proves nothing to it.
 */
export async function POST(request: Request) {
  // Every refusal is logged with its reason: the upload library shows the
  // browser only "Failed to retrieve the client token", whatever happened.
  const refuse = (error: string, status: number) => {
    console.error(`[agreements/upload] ${status}: ${error}`);
    return Response.json({ error }, { status });
  };

  const { userId } = await auth();
  if (!userId) return refuse("Sign in again.", 401);

  const problem = blobUploadProblem();
  if (problem) return refuse(problem, 503);

  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await requireSession();
        if (session.role !== "admin" && session.role !== "sales") {
          throw new Error("Only deal owners and admins can upload agreements.");
        }
        const accountId = (JSON.parse(clientPayload ?? "{}") as { accountId?: string })
          .accountId;
        if (!accountId) throw new Error("Which customer is this for?");
        const [account] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.id, accountId),
              eq(accounts.organizationId, session.organizationId),
            ),
          );
        if (!account) throw new Error("That customer was not found.");
        if (!isInFolder(pathname, agreementFolder(session.organizationId, accountId))) {
          throw new Error("That file cannot go there.");
        }
        return {
          allowedContentTypes: AGREEMENT_CONTENT_TYPES,
          maximumSizeInBytes: AGREEMENT_MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Upload refused.", 400);
  }
}
