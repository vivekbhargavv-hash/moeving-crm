-- What ops needs to know: when the trucks are due, and how many are out.
-- Safe to run after 0005 has committed.

-- When the vehicles are due on the road. Captured when the deal is marked
-- Closed Won, and for an expansion by the deploy-more-vehicles sheet.
--
-- Deliberately NOT expected_close_date: that is a sales forecast of when the
-- deal would close, often months stale by the time the deal is won. Ops cannot
-- plan against a number that meant something else.
ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "deployment_date" date;

-- How many of fleet_size are actually deployed. A count, not a flag: ops
-- routinely delivers part of a fleet, and "8 of 12 out" is the true state.
ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "vehicles_deployed" integer DEFAULT 0 NOT NULL;

-- Deals won before this existed have no deployment date; the expected close
-- date is the only estimate anyone recorded, so it seeds the column rather
-- than leaving ops with a blank list. They can correct it.
UPDATE "opportunities"
   SET "deployment_date" = "expected_close_date"
 WHERE "stage" = 'closed_won'
   AND "deployment_date" IS NULL
   AND "expected_close_date" IS NOT NULL;

-- A won deal ops cannot schedule is a won deal ops will forget. Same rule as
-- the cost sheet: the database refuses the half-filled row.
ALTER TABLE "opportunities"
  DROP CONSTRAINT IF EXISTS "opps_won_requires_deployment_date";
ALTER TABLE "opportunities"
  ADD CONSTRAINT "opps_won_requires_deployment_date"
  CHECK ("stage" <> 'closed_won' OR "deployment_date" IS NOT NULL);

-- You cannot deploy more trucks than the deal is for, or a negative number.
ALTER TABLE "opportunities"
  DROP CONSTRAINT IF EXISTS "opps_deployed_within_fleet";
ALTER TABLE "opportunities"
  ADD CONSTRAINT "opps_deployed_within_fleet"
  CHECK ("vehicles_deployed" >= 0 AND "vehicles_deployed" <= "fleet_size");

CREATE INDEX IF NOT EXISTS "opps_org_deployment_idx"
  ON "opportunities" USING btree ("organization_id", "deployment_date");
