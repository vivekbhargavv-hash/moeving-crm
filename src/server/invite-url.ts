/**
 * Building the invitation's landing URL.
 *
 * Kept free of Next and Clerk so it can be tested directly, because getting
 * this wrong is silent: Clerk accepts a relative `redirectUrl` happily, stores
 * it in the ticket as `rurl`, and only when somebody clicks the link weeks
 * later does it resolve against Clerk's OWN Frontend API domain and 404.
 *
 * That is exactly what happened: `/sign-up` became
 * `https://<instance>.clerk.accounts.dev/sign-up`. Nothing anywhere reported
 * an error — the invitation was created, the email was sent, the link was dead.
 */

/**
 * An absolute sign-up URL for `origin`, or `undefined` when no usable origin
 * is known.
 *
 * `undefined` is deliberate and safe: Clerk then falls back to its own hosted
 * sign-up page, which at least exists. A relative path does not.
 */
export function inviteRedirectUrl(
  origin: string | null | undefined,
): string | undefined {
  if (!origin) return undefined;
  const trimmed = origin.trim();
  // The whole point: only an absolute http(s) origin is acceptable here.
  if (!/^https?:\/\/[^/\s]+$/i.test(trimmed.replace(/\/+$/, ""))) {
    return undefined;
  }
  return `${trimmed.replace(/\/+$/, "")}/sign-up`;
}
