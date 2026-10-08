/**
 * Signed customer agreements — the rules, free of React and the database so
 * they are tested directly.
 *
 * An agreement belongs to a customer and may name one deal. Vivek, Oct 2026:
 * "mostly one customer will have one agreement; sometimes one per deal; and
 * addendums when anything changes". So:
 *
 * - an agreement naming NO deal covers every deal for that customer;
 * - one naming a deal covers that deal, and any expansion grown out of it
 *   (more trucks on the terms already signed);
 * - a won deal with nothing covering it says "No agreement" — a warning,
 *   never a block on winning.
 *
 * The Pipeline asks the same question in SQL (`hasAgreementSql` in
 * server/queries.ts); `isCovered` is that rule in one place to read and test.
 */

import type { AgreementType } from "@/db/schema";

export const AGREEMENT_TYPES: { value: AgreementType; label: string; short: string }[] = [
  { value: "msa", label: "Master agreement (MSA)", short: "MSA" },
  { value: "addendum", label: "Addendum", short: "Addendum" },
  { value: "other", label: "Other", short: "Other" },
];

export const AGREEMENT_TYPE_LABEL = Object.fromEntries(
  AGREEMENT_TYPES.map((t) => [t.value, t.short]),
) as Record<AgreementType, string>;

/**
 * What can be uploaded: a signed PDF, a phone photo of the signature page, or
 * the Word file. Big enough for a scanned 40-page contract, small enough that
 * a phone on 4G finishes the upload.
 */
export const AGREEMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const AGREEMENT_MAX_BYTES = 25 * 1024 * 1024;
export const AGREEMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.doc,.docx," +
  AGREEMENT_CONTENT_TYPES.join(",");

/** Why a file cannot be uploaded, in words, or null when it can. */
export function fileProblem(file: { size: number; type: string; name: string }) {
  if (file.size === 0) return "That file is empty.";
  if (file.size > AGREEMENT_MAX_BYTES) {
    return `That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is 25 MB — a PDF export of a scan is usually far smaller.`;
  }
  // Some phones report no type for HEIC; trust the extension then.
  if (file.type && !AGREEMENT_CONTENT_TYPES.includes(file.type)) {
    return "Upload a PDF, a photo (JPG, PNG, HEIC) or a Word file.";
  }
  if (!file.type && !/\.(pdf|jpe?g|png|heic|heif|webp|docx?)$/i.test(file.name)) {
    return "Upload a PDF, a photo (JPG, PNG, HEIC) or a Word file.";
  }
  return null;
}

/**
 * Where a file is kept in the blob store.
 *
 * The organization is the first folder, and the server refuses to record an
 * agreement whose file is not under the caller's own — otherwise a crafted
 * request could attach another tenant's file to one of your customers.
 */
export function agreementFolder(organizationId: string, accountId: string) {
  return `agreements/${organizationId}/${accountId}/`;
}

/** The file name, kept readable but safe as a URL path segment. */
export function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(-120);
  return cleaned || "agreement";
}

export function isInFolder(pathname: string, folder: string) {
  return pathname.startsWith(folder) && !pathname.slice(folder.length).includes("..");
}

/* ----------------------------------------------------------------- coverage */

export type CoverageAgreement = { opportunityId: string | null };
export type CoverageDeal = { id: string; parentOpportunityId: string | null };

/**
 * Is there signed paper behind this deal?
 *
 * `agreements` must already be the deal's own customer's.
 */
export function isCovered(deal: CoverageDeal, agreements: CoverageAgreement[]) {
  return agreements.some(
    (a) =>
      a.opportunityId === null ||
      a.opportunityId === deal.id ||
      (deal.parentOpportunityId !== null &&
        a.opportunityId === deal.parentOpportunityId),
  );
}

/* ----------------------------------------------------------------- renewals */

/** How far ahead a renewal starts to be mentioned. */
export const RENEWAL_WINDOW_DAYS = 60;

export type RenewalState = "overdue" | "due" | "later";

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days from `today` to `day`; negative once it has passed. */
export function daysUntil(day: string, today: string) {
  const ms =
    new Date(`${day}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export function renewalState(renewalOn: string | null, today: string): RenewalState | null {
  if (!renewalOn) return null;
  if (renewalOn < today) return "overdue";
  if (renewalOn <= addDays(today, RENEWAL_WINDOW_DAYS)) return "due";
  return "later";
}

export type RenewalCandidate = {
  id: string;
  accountId: string;
  opportunityId: string | null;
  renewalOn: string | null;
};

/**
 * The agreements somebody needs to act on: renewing within the window, or
 * already past it.
 *
 * An agreement stops asking once it has been replaced — when the same
 * customer has another agreement, for the same deal or for the whole
 * customer, whose renewal date is later. Uploading the renewed contract is
 * therefore what clears the reminder; nobody has to remember to tick it off.
 * Clearing the renewal date on the old one also clears it.
 *
 * Every agreement the organization holds is passed in at once — a few per
 * customer — so this is arithmetic, not a query per row.
 */
export function renewalsDue<T extends RenewalCandidate>(agreements: T[], today: string) {
  return agreements
    .filter((a) => {
      const state = renewalState(a.renewalOn, today);
      if (state !== "overdue" && state !== "due") return false;
      const replaced = agreements.some(
        (b) =>
          b.id !== a.id &&
          b.accountId === a.accountId &&
          (b.opportunityId === a.opportunityId || b.opportunityId === null) &&
          // A LATER renewal date, not merely a later upload: an addendum
          // signed afterwards usually has no end date of its own and does
          // not renew the agreement it amends.
          b.renewalOn !== null &&
          b.renewalOn > a.renewalOn!,
      );
      return !replaced;
    })
    .sort((a, b) => (a.renewalOn! < b.renewalOn! ? -1 : 1));
}
