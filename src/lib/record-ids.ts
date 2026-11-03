/**
 * The IDs people read: L-0012 for a lead, D-0045 for a deal, DP-0031 for one
 * entry in the deployment log.
 *
 * The database stores a plain running number (`ref`) on each row; the prefix
 * and padding are added here, in one place, so every export spells them the
 * same way. Four digits is padding, not a limit — the 10,000th deal is
 * D-10000.
 *
 * How they connect: a lead that became a deal carries that deal's ID; a deal
 * raised from a lead carries the lead's; a repeat order carries its parent
 * deal's; and every deployment-log row carries its deal's. A deal at
 * Contracting appears in both the Pipeline and the Deployments exports with
 * the SAME Deal ID — that is the column to de-duplicate on.
 */

const pad = (n: number) => String(n).padStart(4, "0");

const format =
  (prefix: string) =>
  (ref: number | null | undefined): string =>
    ref === null || ref === undefined ? "" : `${prefix}-${pad(ref)}`;

export const leadId = format("L");
export const dealId = format("D");
export const deploymentId = format("DP");
