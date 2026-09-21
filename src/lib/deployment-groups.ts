import { daysUntil, monthLabelLong } from "@/lib/utils";

/**
 * How the Deployments queue is cut into sections.
 *
 * Kept free of React so the boundaries — what counts as overdue, what counts
 * as this week — can be tested directly. The board only renders what these
 * return.
 */

/** The shape both groupings need; `Deployment` satisfies it. */
export type Groupable = {
  deploymentDate: string | null;
  city: string | null;
  vehicleType: string | null;
  fleetSize: number;
  vehiclesDeployed: number;
};

export type Group<T> = {
  key: string;
  label: string;
  rows: T[];
  /** Overdue is the one section that is a problem, not just a heading. */
  tone?: "bad";
  /** Shown on the right of a city heading, where the mix is worth knowing. */
  note?: string;
};

/** Undated work sorts last rather than pretending to be urgent. */
export function bySoonest(a: Groupable, b: Groupable) {
  if (a.deploymentDate === b.deploymentDate) return 0;
  if (a.deploymentDate === null) return 1;
  if (b.deploymentDate === null) return -1;
  return a.deploymentDate < b.deploymentDate ? -1 : 1;
}

/**
 * Overdue, this week, next week, then a section per month.
 *
 * "This week" is the next seven days rather than the calendar week: on a
 * Friday afternoon a Monday delivery is this week's problem, whatever the
 * calendar says.
 *
 * Keys are sort prefixes, not labels — they are what puts Overdue above This
 * week above October, with undated last.
 */
export function groupByDueDate<T extends Groupable>(
  rows: T[],
  today: string,
  now = new Date(),
): Group<T>[] {
  const buckets = new Map<string, Group<T>>();
  const put = (key: string, label: string, row: T, tone?: "bad") => {
    let g = buckets.get(key);
    if (!g) buckets.set(key, (g = { key, label, rows: [], tone }));
    g.rows.push(row);
  };

  for (const row of rows) {
    if (!row.deploymentDate) {
      put("zzz-undated", "No date set", row);
      continue;
    }
    if (row.deploymentDate < today) {
      put("0-overdue", "Overdue", row, "bad");
      continue;
    }
    const days = daysUntil(row.deploymentDate, now) ?? 0;
    if (days <= 7) put("1-week", "This week", row);
    else if (days <= 14) put("2-week", "Next week", row);
    else {
      const month = row.deploymentDate.slice(0, 7);
      put(`3-${month}`, monthLabelLong(month), row);
    }
  }

  return [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((g) => ({ ...g, rows: [...g.rows].sort(bySoonest) }));
}

/**
 * A section per city, soonest-due city first, and inside it the soonest job.
 *
 * The heading carries the city's total because that is the number someone
 * planning a hub's week is actually after, and the note says whether it is
 * one load plan or several.
 */
export function groupByCity<T extends Groupable>(rows: T[]): Group<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.city ?? "No city";
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(row);
  }

  return [...buckets.entries()]
    .map(([label, group]) => {
      const sorted = [...group].sort(bySoonest);
      const types = new Set(sorted.map((d) => d.vehicleType ?? "—"));
      return {
        key: label,
        label,
        rows: sorted,
        note:
          types.size === 1 ? `all ${[...types][0]}` : `${types.size} types`,
      };
    })
    .sort((a, b) => {
      // The place needing trucks first is the place at the top; a city with no
      // date at all sorts last.
      const da = a.rows[0]?.deploymentDate ?? null;
      const db = b.rows[0]?.deploymentDate ?? null;
      if (da === db) return a.label < b.label ? -1 : 1;
      if (da === null) return 1;
      if (db === null) return -1;
      return da < db ? -1 : 1;
    });
}
