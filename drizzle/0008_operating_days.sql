-- How many days a month the contract runs on.
--
-- 26 for a six-day week, 30 for every day. The same monthly rent means a
-- different day rate under each, and that is the first thing anyone asks when
-- comparing two deals — so it is recorded on the deal rather than remembered.
--
-- Deliberately NOT arithmetic: `price` stays the monthly rate per vehicle
-- whichever is chosen, and nothing is computed from this column. Deliberately
-- NOT backfilled either: a deal raised before this existed has no answer, and
-- defaulting one would be inventing a contract term nobody agreed.

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "operating_days" integer;
