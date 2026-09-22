import type { Groupable } from "@/lib/deployment-groups";

/**
 * The deployments queue read the way the forecast is: city down the side,
 * month across the top, vehicles in the cells.
 *
 * The other two groupings answer "what is late" and "what does Bangalore
 * owe". This one answers the question a hub asks a month ahead — how many
 * trucks land where, and when — which is a shape, not a list, and a list is
 * what the queue could only ever be.
 *
 * Kept free of React, like the groupings beside it, so the arithmetic that
 * decides what a cell says can be tested directly.
 */

/** What one cell of the grid counts. */
export type GridCell<T> = {
  /** Vehicles promised in this city in this month. */
  vehicles: number;
  /** Of those, how many are not on the road yet. */
  remaining: number;
  /** The deals behind the number, soonest first. */
  items: T[];
};

export type GridRow<T> = {
  key: string;
  city: string;
  /** One per month, in the same order as `months`. */
  cells: GridCell<T>[];
  total: GridCell<T>;
};

export type DeploymentGrid<T> = {
  /** "2026-10" keys, ascending, only months something is actually due in. */
  months: string[];
  rows: GridRow<T>[];
  monthTotals: GridCell<T>[];
  total: GridCell<T>;
  /**
   * Won deals with no deployment date. They have no column to sit in, and
   * dropping them silently would make the grid disagree with the queue.
   */
  undated: T[];
};

const empty = <T>(): GridCell<T> => ({ vehicles: 0, remaining: 0, items: [] });

function add<T extends Groupable>(cell: GridCell<T>, row: T) {
  cell.vehicles += row.fleetSize;
  cell.remaining += Math.max(0, row.fleetSize - row.vehiclesDeployed);
  cell.items.push(row);
}

/** Every month from `first` to `last`, inclusive. */
function monthRange(first: string, last: string) {
  const months: string[] = [];
  const [y, m] = first.split("-").map(Number);
  const cursor = new Date(Date.UTC(y!, m! - 1, 1));
  const end = `${last}-01`;
  // A guard rather than a limit: a bad date in one row must not spin forever.
  for (let i = 0; i < 120; i++) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    months.push(key);
    if (`${key}-01` >= end) break;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/**
 * The window is the data's own span, month by month, with no gaps.
 *
 * A fixed window either hides a delivery that slipped past its end or pads
 * the grid with empty months nobody scrolls to, so the data says where it
 * starts and stops — which on this screen includes months already gone,
 * because an overdue deployment is the most interesting number on the page.
 *
 * The months in between are kept even when nothing is due in them. A grid
 * that prints Sep, Nov, Jan reads as a stride rather than a calendar, and the
 * empty column is itself the answer to "what is October looking like".
 */
export function buildDeploymentGrid<T extends Groupable>(
  rows: T[],
): DeploymentGrid<T> {
  const undated = rows.filter((r) => !r.deploymentDate);
  const dated = rows.filter((r) => r.deploymentDate);

  const present = [
    ...new Set(dated.map((r) => r.deploymentDate!.slice(0, 7))),
  ].sort();
  const months = present.length
    ? monthRange(present[0]!, present[present.length - 1]!)
    : [];
  const index = new Map(months.map((m, i) => [m, i]));

  const byCity = new Map<string, GridRow<T>>();
  for (const row of dated) {
    const city = row.city ?? "No city";
    let line = byCity.get(city);
    if (!line) {
      byCity.set(
        city,
        (line = {
          key: city,
          city,
          cells: months.map(() => empty<T>()),
          total: empty<T>(),
        }),
      );
    }
    add(line.cells[index.get(row.deploymentDate!.slice(0, 7))!]!, row);
    add(line.total, row);
  }

  const monthTotals = months.map(() => empty<T>());
  const total = empty<T>();
  for (const row of dated) {
    add(monthTotals[index.get(row.deploymentDate!.slice(0, 7))!]!, row);
    add(total, row);
  }

  // Inside a cell, soonest first: within one month the date is the only
  // ordering anybody planning a week cares about.
  const bySoonest = (a: T, b: T) =>
    (a.deploymentDate ?? "") < (b.deploymentDate ?? "") ? -1 : 1;
  for (const line of byCity.values()) {
    for (const cell of line.cells) cell.items.sort(bySoonest);
    line.total.items.sort(bySoonest);
  }
  for (const cell of monthTotals) cell.items.sort(bySoonest);

  return {
    months,
    // The city owing the most trucks leads, because that is the one a
    // planner has to solve first.
    rows: [...byCity.values()].sort(
      (a, b) => b.total.vehicles - a.total.vehicles || (a.city < b.city ? -1 : 1),
    ),
    monthTotals,
    total,
    undated,
  };
}
