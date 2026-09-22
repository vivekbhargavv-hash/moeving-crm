"use client";

import { ChevronRight } from "lucide-react";
import * as React from "react";

import { buildDeploymentGrid } from "@/lib/deployment-grid";
import { cn, formatDateCompact, monthLabel, monthLabelLong, num } from "@/lib/utils";
import type { Deployment } from "@/server/queries";

/**
 * Deployments as a shape: city down the side, month across the top, vehicles
 * in the cells — the Forecast grid's question asked of work already sold.
 *
 * The forecast reaches back to the server for a city's deals because a
 * forecast covers every open deal there is. This screen already holds every
 * outstanding deployment in the page, so expanding a city is arithmetic, not
 * a round trip: the detail opens instantly, which matters on the one screen
 * someone stands in a yard with.
 */
export function DeploymentGridView({
  deployments,
  /** Ops must not reach a deal page; it carries the margin. */
  canOpenDeals,
}: {
  deployments: Deployment[];
  canOpenDeals: boolean;
}) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const grid = React.useMemo(
    () => buildDeploymentGrid(deployments),
    [deployments],
  );

  const max = Math.max(
    1,
    ...grid.rows.flatMap((r) => r.cells.map((c) => c.vehicles)),
  );
  const open = grid.rows.find((r) => r.key === expanded) ?? null;

  if (grid.months.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
        <p className="font-semibold">Nothing with a date to plan against</p>
        <p className="mt-1 text-sm text-muted">
          {grid.undated.length
            ? `${num(grid.undated.length)} won ${grid.undated.length === 1 ? "deal has" : "deals have"} no deployment date, so there is no month to put them in.`
            : "Deals appear here once they are marked Closed Won."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 rounded-r-[14px] bg-gradient-to-l from-white to-transparent sm:hidden"
        />
        <div className="no-scrollbar overflow-x-auto rounded-[14px] border border-line bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 bg-white py-2.5 pl-3 pr-1 text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                  City
                </th>
                {grid.months.map((m) => (
                  <th
                    key={m}
                    className="px-1 py-2.5 text-center text-[12px] font-semibold uppercase tracking-wide text-muted"
                  >
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="hidden px-3 py-3 text-right text-[13px] font-semibold uppercase tracking-wide text-muted sm:table-cell">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((r) => (
                <tr
                  key={r.key}
                  className={cn(
                    "border-b border-line last:border-0",
                    expanded === r.key && "bg-brand-soft/40",
                  )}
                >
                  <th
                    className={cn(
                      "sticky left-0 z-10 py-2 pl-3 pr-1 text-left text-[13px] font-semibold",
                      expanded === r.key ? "bg-brand-soft/40" : "bg-white",
                    )}
                  >
                      <button
                        onClick={() =>
                          setExpanded(expanded === r.key ? null : r.key)
                        }
                        aria-expanded={expanded === r.key}
                        className="flex h-11 items-center gap-1 text-left active:opacity-70"
                      >
                        <ChevronRight
                          size={14}
                          className={cn(
                            "shrink-0 text-muted transition",
                            expanded === r.key && "rotate-90",
                          )}
                        />
                        {r.city}
                      </button>
                    </th>
                    {r.cells.map((c, i) => (
                      <td key={grid.months[i]} className="p-1 text-center">
                        <button
                          disabled={!c.vehicles}
                          onClick={() =>
                            setExpanded(expanded === r.key ? null : r.key)
                          }
                          className={cn(
                            "tabular h-11 w-full min-w-[42px] rounded-lg text-[15px] font-semibold transition",
                            c.vehicles
                              ? "hover:ring-2 hover:ring-brand/30"
                              : "cursor-default text-muted/40",
                          )}
                          style={
                            c.vehicles
                              ? {
                                  backgroundColor: `color-mix(in oklab, var(--color-brand) ${8 + (c.vehicles / max) * 42}%, white)`,
                                }
                              : undefined
                          }
                        >
                          {c.vehicles ? num(c.vehicles) : "·"}
                        </button>
                      </td>
                    ))}
                  <td className="tabular hidden py-2 pl-1 pr-3 text-right text-[13px] font-bold sm:table-cell">
                    {num(r.total.vehicles)}
                  </td>
                </tr>
              ))}

              <tr className="bg-canvas">
                <th className="sticky left-0 z-10 bg-canvas py-2.5 pl-3 pr-1 text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                  Total
                </th>
                {grid.monthTotals.map((t, i) => (
                  <td
                    key={grid.months[i]}
                    className="tabular px-1 py-2.5 text-center text-[13px] font-semibold"
                  >
                    {t.vehicles ? num(t.vehicles) : "·"}
                  </td>
                ))}
                <td className="tabular hidden py-2.5 pl-1 pr-3 text-right text-[13px] font-bold sm:table-cell">
                  {num(grid.total.vehicles)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-1.5 px-1 text-[11.5px] text-muted sm:hidden">
        Swipe the grid sideways for later months. Tap a city for the clients
        behind its numbers.
      </p>

      {/*
       * The city's detail sits UNDER the grid, not inside a row of it.
       *
       * The forecast tucks its drill-down into a table cell and holds it to
       * the viewport width by hand, which works because nothing there has to
       * be read past the fade that hints at sideways scroll. Here the client
       * rows would sit under that fade — legible, and looking cut off. Below
       * the table they get the full width of the page and no hack.
       */}
      {open ? (
        <section className="mt-3 rounded-[14px] border border-line bg-white">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">
              {open.city}
            </h3>
            <span className="tabular shrink-0 text-[13px] text-muted">
              {num(open.total.vehicles)} veh
              {open.total.remaining
                ? ` · ${num(open.total.remaining)} to go`
                : " · all out"}
            </span>
            <button
              onClick={() => setExpanded(null)}
              aria-label={`Close ${open.city}`}
              className="-mr-2 h-9 w-9 shrink-0 rounded-lg text-xl leading-none text-muted active:bg-canvas"
            >
              ×
            </button>
          </div>
          <div className="space-y-3 px-4 py-3">
            {open.cells.map((cell, i) =>
              cell.items.length === 0 ? null : (
                <div key={grid.months[i]}>
                  <div className="flex items-baseline gap-2 border-b border-line pb-1">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                      {monthLabelLong(grid.months[i]!)}
                    </p>
                    <p className="tabular ml-auto text-[12px] text-muted">
                      {num(cell.vehicles)} veh
                      {cell.remaining ? ` · ${num(cell.remaining)} to go` : " · all out"}
                    </p>
                  </div>
                  <ul className="divide-y divide-line">
                    {cell.items.map((d) => (
                      <ClientRow key={d.id} d={d} canOpenDeals={canOpenDeals} />
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        </section>
      ) : null}

      <p className="mt-3 px-1 text-xs text-muted">
        Vehicles owed on won deals, in the month they are due. {num(grid.total.remaining)} of{" "}
        {num(grid.total.vehicles)} are still to go out.
        {grid.undated.length
          ? ` ${num(grid.undated.length)} ${grid.undated.length === 1 ? "deal has" : "deals have"} no deployment date and cannot be placed in a month — they are in the By date view under “No date set”.`
          : ""}
      </p>
    </div>
  );
}

/** One client's delivery: who, what, how many, and how many are already out. */
function ClientRow({
  d,
  canOpenDeals,
}: {
  d: Deployment;
  canOpenDeals: boolean;
}) {
  const left = Math.max(0, d.fleetSize - d.vehiclesDeployed);

  // Two lines, not four columns. Four columns on a 326px panel left the
  // customer's name eight characters wide — and the name is the reason
  // somebody opened the city.
  const body = (
    <>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
          {d.accountName}
        </span>
        <span
          className={cn(
            "tabular shrink-0 whitespace-nowrap text-[13px] font-semibold",
            left === 0 ? "text-emerald-700" : "text-ink",
          )}
        >
          {left === 0 ? "all out" : `${left} left`}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2 text-[12.5px] text-muted">
        <span className="min-w-0 flex-1 truncate">
          {d.fleetSize} × {d.vehicleType ?? "—"}
        </span>
        <span className="tabular shrink-0 whitespace-nowrap">
          {formatDateCompact(d.deploymentDate)}
        </span>
      </div>
    </>
  );

  return (
    <li>
      {canOpenDeals ? (
        <a
          href={`/opportunities/${d.id}`}
          className="block py-2.5 active:opacity-70"
        >
          {body}
        </a>
      ) : (
        <div className="py-2.5">{body}</div>
      )}
    </li>
  );
}
