import "server-only";

/**
 * Why agreement uploads cannot work in this deployment, in words a person
 * can act on — or null when they can.
 *
 * Client uploads are signed with the store's read-write token. Vercel only
 * gives a deployment the environment variables that existed when it was
 * BUILT, so a store connected afterwards is invisible until the next deploy,
 * and a store connected for Production only is invisible to previews. Newer
 * store connections may also provide `BLOB_STORE_ID` (keyless OIDC) instead
 * of a token, which the upload signer here does not accept. Each case gets
 * its own sentence, because "Failed to retrieve the client token" — all the
 * upload library ever says — sent the first test nowhere.
 */
export function blobUploadProblem(): string | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return null;
  const where = process.env.VERCEL_ENV ?? "this";
  if (process.env.BLOB_STORE_ID) {
    return `The ${where} deployment has the Blob store's ID but no read-write token (BLOB_READ_WRITE_TOKEN), which uploads need. In Vercel → Storage → the store → Connect / .env.local, copy the read-write token into the project's environment variables, then redeploy.`;
  }
  return `The ${where} deployment has no Blob store credentials. Connect the store to this project for ${where === "preview" ? "Preview" : where === "production" ? "Production" : "this environment"}, then redeploy — a deployment only sees variables that existed when it was built.`;
}
