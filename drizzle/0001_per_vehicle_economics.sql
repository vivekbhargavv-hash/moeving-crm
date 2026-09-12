-- Closed Won figures become PER VEHICLE PER MONTH — the unit economics of one
-- truck — matching how `price` was already stored. Deal-level numbers are
-- derived by multiplying by fleet_size, so changing the fleet rescales the
-- whole deal instead of leaving stale totals behind.
--
-- Existing rows hold deal-level totals, so they are divided by fleet_size.
-- Generated columns cannot be altered in place; they are dropped and rebuilt
-- around the new meaning.

ALTER TABLE opportunities
  DROP COLUMN IF EXISTS total_cost,
  DROP COLUMN IF EXISTS gross_margin,
  DROP COLUMN IF EXISTS margin_pct;

UPDATE opportunities SET
  revenue          = round(revenue::numeric          / fleet_size),
  lease_cost       = round(lease_cost::numeric       / fleet_size),
  driver_cost      = round(driver_cost::numeric      / fleet_size),
  charging_cost    = round(charging_cost::numeric    / fleet_size),
  parking_cost     = round(parking_cost::numeric     / fleet_size),
  maintenance_cost = round(maintenance_cost::numeric / fleet_size),
  supervisor_cost  = round(supervisor_cost::numeric  / fleet_size),
  misc_cost        = round(misc_cost::numeric        / fleet_size)
WHERE revenue IS NOT NULL AND fleet_size > 1;

ALTER TABLE opportunities
  ADD COLUMN cost_per_vehicle integer GENERATED ALWAYS AS (
    coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0)
    + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0)
    + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0)
  ) STORED,
  ADD COLUMN margin_per_vehicle integer GENERATED ALWAYS AS (
    coalesce(revenue, 0) - (
      coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0)
      + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0)
      + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0))
  ) STORED,
  ADD COLUMN total_revenue integer GENERATED ALWAYS AS (
    coalesce(revenue, 0) * fleet_size
  ) STORED,
  ADD COLUMN total_cost integer GENERATED ALWAYS AS (
    (coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0)
     + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0)
     + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0)) * fleet_size
  ) STORED,
  ADD COLUMN gross_margin integer GENERATED ALWAYS AS (
    (coalesce(revenue, 0) - (
      coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0)
      + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0)
      + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0))) * fleet_size
  ) STORED,
  -- Identical per vehicle and per deal: the fleet cancels out.
  ADD COLUMN margin_pct numeric(7, 2) GENERATED ALWAYS AS (
    CASE WHEN coalesce(revenue, 0) > 0 THEN round(
      ((coalesce(revenue, 0) - (
        coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0)
        + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0)
        + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0)))::numeric * 100)
      / revenue, 2) END
  ) STORED;

COMMENT ON COLUMN opportunities.revenue IS 'Revenue per vehicle per month';
COMMENT ON COLUMN opportunities.lease_cost IS 'Lease cost per vehicle per month';
