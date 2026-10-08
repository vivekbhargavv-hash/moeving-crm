import "server-only";

/**
 * Why agreement uploads cannot work in this deployment, in words a person
 * can act on — or null when they can.
 *
 * The store can be connected two ways, and both work: the older way puts a
 * read-write token (`BLOB_READ_WRITE_TOKEN`) in the environment; the newer,
 * keyless way puts only the store's ID (`BLOB_STORE_ID`) there and signs with
 * Vercel's own OIDC token at runtime. Ours was connected the newer way.
 *
 * Vercel only gives a deployment the variables that existed when it was
 * BUILT, so a store connected afterwards is invisible until the next deploy,
 * and one connected for Production only is invisible to previews.
 */
export function blobUploadProblem(): string | null {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return null;
  const where = process.env.VERCEL_ENV ?? "this";
  return `The ${where} deployment is not connected to the Blob store. In Vercel → Storage → the store → Projects, connect it for ${where === "preview" ? "Preview" : where === "production" ? "Production" : "this environment"}, then redeploy — a deployment only sees what existed when it was built.`;
}
