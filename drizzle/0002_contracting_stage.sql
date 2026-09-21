-- Contracting: verbally agreed, paperwork in flight.
--
-- This file holds nothing else on purpose. Postgres will not let a new enum
-- value be USED in the same transaction that adds it, so the stage probability
-- that references 'contracting' is seeded in 0003 instead.
ALTER TYPE "public"."sales_stage" ADD VALUE IF NOT EXISTS 'contracting' BEFORE 'closed_won';
