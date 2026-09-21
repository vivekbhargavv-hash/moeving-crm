import { clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";

import { inviteRedirectUrl } from "@/server/invite-url";

/**
 * Asking Clerk to email someone a sign-up link.
 *
 * Adding a person in Admin used to create only the CRM row; somebody then had
 * to remember to invite the same address in the Clerk dashboard, and until they
 * did, the new joiner had nothing to click. This closes that gap.
 *
 * The CRM row stays the source of truth for who belongs to which organization
 * and in what role — Clerk only proves who someone is. So an invitation that
 * fails to send is never allowed to fail the whole operation: the row is
 * written, the admin is told, and the invite can be sent again.
 *
 * Clerk reporting success does NOT mean the email arrived. On a development
 * instance it is sent from a shared Clerk domain that corporate mail servers
 * routinely reject or file as spam, and nothing reports that back. That is why
 * the accept link is kept: Admin can hand it over by hand when the mail does
 * not land. The real cure is a production Clerk instance on a custom domain.
 */

export type InviteOutcome =
  /** `url` is Clerk's accept link — see the note above about email delivery. */
  | { sent: true; url: string | null }
  /** Already invited, or already has a Clerk account — nothing to do. */
  | { sent: false; reason: "already-invited" }
  | { sent: false; reason: "failed"; message: string };

/**
 * The origin to send the invited person back to.
 *
 * The host the admin is currently on is the best answer: it is, by definition,
 * a domain this app is served from. `VERCEL_PROJECT_PRODUCTION_URL` is the
 * fallback for anything running outside a request.
 */
async function appOrigin(): Promise<string | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  } catch {
    /* no request context — fall through */
  }
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? null;
}

export async function sendInvitation(email: string): Promise<InviteOutcome> {
  try {
    const clerk = await clerkClient();
    // Must be absolute — see invite-url.ts for the 404 this caused.
    const redirectUrl = inviteRedirectUrl(await appOrigin());

    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl,
      // Re-inviting someone who already has an invitation is a duplicate, not
      // an error worth showing an admin.
      ignoreExisting: true,
    });
    // Clerk returns the accept link. Keeping it means onboarding does not
    // depend on an email arriving: an admin can hand it over directly.
    return { sent: true, url: invitation.url ?? null };
  } catch (error) {
    const message = clerkErrorMessage(error);
    // "duplicate" covers both an outstanding invitation and an address that
    // already signed up — in either case the person can get in, so it is not
    // something for an admin to act on.
    if (/duplicate|already/i.test(message)) {
      return { sent: false, reason: "already-invited" };
    }
    return { sent: false, reason: "failed", message };
  }
}

/** Clerk errors carry the useful text in `errors[0]`, not in `message`. */
function clerkErrorMessage(error: unknown): string {
  const e = error as {
    errors?: { message?: string; longMessage?: string }[];
    message?: string;
  };
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    "Clerk could not be reached"
  );
}
