import { auth } from "@clerk/nextjs/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
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

/** How long the browser has to start sending the file. */
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

/**
 * Hands the browser a presigned URL to upload ONE agreement file straight to
 * the private blob store.
 *
 * Straight to the store, not through this server: a Vercel function refuses
 * a request body over 4.5 MB, and a scanned contract is routinely bigger. The
 * file never passes through here — only the question "may this person put
 * this file in this customer's folder?", which is answered from the session:
 *
 * - a deal owner or an admin (Vivek: every deal owner may upload);
 * - of this organization, for a customer of this organization;
 * - at exactly the pathname asked for, inside `agreements/<org>/<customer>/`;
 * - a PDF, photo or Word file, 25 MB at most, within ten minutes.
 *
 * PRESIGNED, not the older client-token flow: that one signs with a
 * read-write token, and the store was connected the newer, keyless way (a
 * store ID plus Vercel's own OIDC token, no secret in the environment).
 * `issueSignedToken` signs with whichever credentials the deployment has.
 *
 * The agreement row itself is written afterwards by `createAgreement`, which
 * checks the folder again — this URL being issued proves nothing to it.
 */
export async function POST(request: Request) {
  // Every refusal is logged with its reason: the upload library shows the
  // browser only a generic failure, whatever happened here.
  const refuse = (error: string, status: number) => {
    console.error(`[agreements/upload] ${status}: ${error}`);
    return Response.json({ error }, { status });
  };

  const { userId } = await auth();
  if (!userId) return refuse("Sign in again.", 401);

  const problem = blobUploadProblem();
  if (problem) return refuse(problem, 503);

  const body = (await request.json()) as HandleUploadPresignedBody;
  // Completion callbacks are never requested, so none should arrive. The key
  // is only there because the helper insists on one; a forged callback fails
  // its signature check against it.
  if (body.type !== "blob.generate-presigned-url") {
    return refuse("Unexpected upload event.", 400);
  }

  try {
    const result = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || "callbacks-not-used",
      getSignedToken: async (pathname, clientPayload) => {
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

        const validUntil = Date.now() + UPLOAD_WINDOW_MS;
        // Scoped to this one pathname and to writing, nothing else.
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          validUntil,
          allowedContentTypes: AGREEMENT_CONTENT_TYPES,
          maximumSizeInBytes: AGREEMENT_MAX_BYTES,
        });
        return {
          token,
          urlOptions: {
            validUntil,
            allowedContentTypes: AGREEMENT_CONTENT_TYPES,
            maximumSizeInBytes: AGREEMENT_MAX_BYTES,
            // The browser makes the name unique; never replace a contract.
            allowOverwrite: false,
          },
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Upload refused.", 400);
  }
}
