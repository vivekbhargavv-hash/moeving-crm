-- The lead funnel: when it came in, when we rang back, when it became a deal.
--
-- `created_at` and `actioned_at` were already here, but conversion overwrote
-- `actioned_at` with the moment of conversion — which erased the one timestamp
-- that says how long an enquiry waited for its call, and replaced it with a
-- moment that now has a column of its own.
--
-- Backfill: a lead that is already `converted` gets `updated_at` as its
-- conversion time, because that is the last thing that happened to it and the
-- conversion is what happened. It is an estimate, and deliberately the only
-- one — nothing here guesses at an `actioned_at` that conversion has already
-- overwritten, so leads converted before today report their callback and their
-- conversion as the same moment. Leads converted from here on record both
-- honestly.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "converted_at" timestamp with time zone;

UPDATE "leads"
   SET "converted_at" = coalesce("actioned_at", "updated_at")
 WHERE "status" = 'converted'
   AND "converted_at" IS NULL;

-- The funnel is read per organization over a date range, which is the shape
-- every question on the Leads screen asks.
CREATE INDEX IF NOT EXISTS "leads_org_created_idx"
    ON "leads" ("organization_id", "created_at");
