-- Repeat business, invitation tracking, and the Contracting probability.
-- Safe to run after 0002 has committed.

-- A deal that grew out of a won deal points back at it. Never an edit to the
-- won row: that would move a recorded win out of the month it happened in.
ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "parent_opportunity_id" uuid;

ALTER TABLE "opportunities"
  DROP CONSTRAINT IF EXISTS "opportunities_parent_opportunity_id_opportunities_id_fk";
ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_parent_opportunity_id_opportunities_id_fk"
  FOREIGN KEY ("parent_opportunity_id") REFERENCES "public"."opportunities"("id")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "opps_parent_idx"
  ON "opportunities" USING btree ("parent_opportunity_id");

-- When Clerk was asked to email this person a sign-up invitation.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invited_at" timestamp with time zone;

-- Contracting sits between Negotiation (75) and Closed Won (100): they have
-- said yes, but nothing is signed. Each organization can retune it in Admin.
INSERT INTO "stage_probabilities" ("organization_id", "stage", "probability")
SELECT "id", 'contracting', 90 FROM "organizations"
ON CONFLICT ("organization_id", "stage") DO NOTHING;
