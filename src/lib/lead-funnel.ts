/**
 * What the inbound desk is actually producing.
 *
 * Four numbers and the rates between them: enquiries in, calls made back,
 * deals raised, deals won. Kept free of React and the database so the
 * denominators — the part everybody argues about — can be tested directly.
 */

/** One lead, as the funnel needs to see it. */
export type FunnelLead = {
  createdAt: Date | string;
  /** When somebody rang back. Null means nobody has yet. */
  actionedAt: Date | string | null;
  /** When it became a deal. */
  convertedAt: Date | string | null;
  status: "new" | "qualified" | "not_qualified" | "converted";
  /** The stage of the deal it became, if it became one. */
  dealStage: string | null;
};

export type Funnel = {
  enquiries: number;
  /** Rung back, either way — qualified or not. */
  called: number;
  qualified: number;
  notQualified: number;
  /** Still waiting for their first call. */
  uncalled: number;
  converted: number;
  won: number;
  lost: number;
  /** Converted, still open in the pipeline. */
  open: number;
  /**
   * Every rate is out of ENQUIRIES, not out of the step before it.
   *
   * "Inbound conversion" is the question "of the calls we took, how many
   * became business" — so the denominator is every enquiry, including the
   * ones nobody has rung back. A rate measured against the previous step
   * flatters itself: a desk that only ever converts the two leads it bothered
   * to call would report 100%.
   */
  calledPct: number | null;
  qualifiedPct: number | null;
  convertedPct: number | null;
  wonPct: number | null;
  /**
   * Of the leads that became deals, how many were won. The one rate with a
   * different denominator, because it answers a different question: not "how
   * good is the inbound", but "how good are the deals it produces".
   */
  wonOfConvertedPct: number | null;
  /** Median hours from the enquiry landing to somebody ringing back. */
  medianHoursToCall: number | null;
  /** Median days from the enquiry landing to a deal existing. */
  medianDaysToConvert: number | null;
};

const pct = (n: number, of: number) => (of === 0 ? null : (n / of) * 100);

const at = (v: Date | string) => (v instanceof Date ? v : new Date(v)).getTime();

/**
 * The middle value, or the mean of the middle two.
 *
 * A median rather than an average: one enquiry rung back three weeks late
 * drags a mean somewhere no actual lead lives, and the question being asked
 * is "how long does this normally take".
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function buildFunnel(leads: FunnelLead[]): Funnel {
  const enquiries = leads.length;

  const converted = leads.filter((l) => l.status === "converted");
  const won = converted.filter((l) => l.dealStage === "closed_won").length;
  const lost = converted.filter((l) => l.dealStage === "closed_lost").length;

  // Rung back covers everything past `new`, conversions included: a lead that
  // went straight from the enquiry to a deal was unmistakably spoken to.
  const called = leads.filter((l) => l.status !== "new").length;
  const qualified = leads.filter(
    (l) => l.status === "qualified" || l.status === "converted",
  ).length;
  const notQualified = leads.filter((l) => l.status === "not_qualified").length;

  const callGaps = leads
    .filter((l) => l.actionedAt)
    .map((l) => (at(l.actionedAt!) - at(l.createdAt)) / 3_600_000)
    // A backfilled or corrected row can land before its own enquiry; a
    // negative wait is not a fast callback, it is a row that cannot answer.
    .filter((h) => h >= 0);

  const convertGaps = converted
    .filter((l) => l.convertedAt)
    .map((l) => (at(l.convertedAt!) - at(l.createdAt)) / 86_400_000)
    .filter((d) => d >= 0);

  return {
    enquiries,
    called,
    qualified,
    notQualified,
    uncalled: enquiries - called,
    converted: converted.length,
    won,
    lost,
    open: converted.length - won - lost,
    calledPct: pct(called, enquiries),
    qualifiedPct: pct(qualified, enquiries),
    convertedPct: pct(converted.length, enquiries),
    wonPct: pct(won, enquiries),
    wonOfConvertedPct: pct(won, converted.length),
    medianHoursToCall: median(callGaps),
    medianDaysToConvert: median(convertGaps),
  };
}

/** Only the leads whose enquiry landed in the window, `days` back from now. */
export function within<T extends { createdAt: Date | string }>(
  leads: T[],
  days: number | null,
  now = new Date(),
): T[] {
  if (days === null) return leads;
  const cutoff = now.getTime() - days * 86_400_000;
  return leads.filter((l) => at(l.createdAt) >= cutoff);
}
