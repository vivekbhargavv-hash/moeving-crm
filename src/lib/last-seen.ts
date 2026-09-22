/**
 * When someone was last in the CRM.
 *
 * Two small decisions, kept here so both are testable and neither is buried
 * in a React component or an auth guard.
 */

/** Don't write on every page view; once every few minutes is plenty. */
export const SEEN_THROTTLE_MINUTES = 5;

/**
 * Whether this request should bother writing `last_seen_at`.
 *
 * `requireSession()` runs on every server-rendered page, so writing each time
 * would add an UPDATE to every navigation for a figure nobody reads to the
 * minute. Anyone active writes once per throttle window instead.
 */
export function shouldRecordSeen(
  last: Date | null | undefined,
  now: Date = new Date(),
  throttleMinutes: number = SEEN_THROTTLE_MINUTES,
): boolean {
  if (!last) return true;
  const elapsed = now.getTime() - last.getTime();
  // A stored time in the future is a clock problem, not a reason to skip.
  if (elapsed < 0) return true;
  return elapsed >= throttleMinutes * 60_000;
}

/**
 * "just now" / "14 min ago" / "3 days ago" / "22 Sep 2026".
 *
 * The relative forms are lower case so they read as a phrase after a word
 * like "Seen"; the date keeps its capital month, because lower-casing the
 * whole label turned "13 Aug 2026" into "13 aug 2026".
 *
 * Computed on the server and sent as a finished string: the browser never
 * recomputes it, so there is no hydration mismatch and no guessing at which
 * timezone the reader is in.
 */
export function lastSeenLabel(
  when: Date | string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!when) return null;
  const d = typeof when === "string" ? new Date(when) : when;
  if (Number.isNaN(d.getTime())) return null;

  const seconds = Math.round((now.getTime() - d.getTime()) / 1000);
  // A few seconds of clock skew between the database and the app server
  // should read as "just now", not as the future.
  if (seconds < 90) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  // Past a week the date itself is more use than a count of days.
  return formatInIndia(d);
}

/**
 * "1 Sep 2026", in India.
 *
 * Built from parts rather than one `toLocaleDateString` call because en-IN
 * renders September as "Sept" — four letters where every other month gets
 * three, which makes a column of dates ragged. The rest of the app slices the
 * month to three for the same reason.
 */
function formatInIndia(d: Date) {
  const opts = { timeZone: "Asia/Kolkata" } as const;
  const day = d.toLocaleDateString("en-IN", { ...opts, day: "numeric" });
  const month = d
    .toLocaleDateString("en-IN", { ...opts, month: "short" })
    .slice(0, 3);
  const year = d.toLocaleDateString("en-IN", { ...opts, year: "numeric" });
  return `${day} ${month} ${year}`;
}

/** The exact moment, for the tooltip behind the short label. */
export function lastSeenExact(when: Date | string | null | undefined): string | null {
  if (!when) return null;
  const d = typeof when === "string" ? new Date(when) : when;
  if (Number.isNaN(d.getTime())) return null;
  // The whole team is in India, and a fixed zone keeps the server's rendering
  // deterministic — the same rule the rest of the app's dates follow.
  return `${d.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  })} IST`;
}
