-- The operations team: the people who actually put the trucks on the road.
--
-- This file holds nothing else on purpose. Postgres will not let a new enum
-- value be USED in the transaction that adds it, so everything that references
-- 'ops' waits for 0006 — the same reason 0002 stood alone for 'contracting'.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'ops';
