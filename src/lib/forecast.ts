/**
 * Which column of the Sales Closure Forecast a deal lands in.
 *
 * The window starts at the current month. An open deal whose expected closing
 * month has already gone used to fall off the left edge without a word — it
 * was neither won nor lost, and it was nowhere on the page. It goes in an
 * Overdue column instead, so the slipped date is something a deal owner sees
 * and fixes, rather than a number that quietly shrinks.
 *
 * Not rolled into the current month: that would overstate this month and hide
 * the fact that somebody's forecast was wrong.
 *
 * Kept free of React and the database, so the boundary is tested.
 */

/** The key of the Overdue column, alongside "2026-10"-style month keys. */
export const OVERDUE = "overdue";

/**
 * The column for a deal expected to close in `month` ("2026-09"), given the
 * window's months in ascending order. Null when it is past the window's end.
 */
export function forecastColumn(month: string, months: string[]) {
  const first = months[0];
  if (!first) return null;
  if (month < first) return OVERDUE;
  return months.includes(month) ? month : null;
}

/** The last day before the window opens — the end of the Overdue bucket. */
export function dayBefore(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 0)).toISOString().slice(0, 10);
}
