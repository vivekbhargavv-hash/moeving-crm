-- Inbound enquiries, and the desk that takes them.
--
-- The team kept these in a shared spreadsheet, and that sheet was the real
-- specification: its columns are this table's columns. A lead is not a
-- pipeline stage because most enquiries never become deals, and a pipeline
-- that fills up with unqualified calls stops being a forecast.
--
-- `noc` is the desk that answers the phone. They write leads down and see
-- nothing else — not the pipeline, not a margin. Ops cannot see leads at all:
-- they put trucks on the road for deals that exist, and an enquiry carries a
-- caller's name, number and email they have no reason to hold.

ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'noc';

CREATE TYPE "lead_status" AS ENUM ('new', 'qualified', 'not_qualified', 'converted');

CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "enquiry_date" date NOT NULL,
  "company_name" text NOT NULL,
  "type_of_goods" text,
  "vehicle_requirement" integer,
  "calling_city" text,
  "vehicle_type" text,
  "caller_name" text,
  "designation" text,
  "mobile" text,
  "email" text,
  "found_on" text,
  "status" "lead_status" DEFAULT 'new' NOT NULL,
  "remarks" text,
  "not_qualified_reason" text,
  "opportunity_id" uuid REFERENCES "opportunities"("id") ON DELETE set null,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "actioned_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "actioned_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- A no carries its reason, so a no is never a shrug; a converted lead knows
  -- which deal it became. Enforced here so no code path can half-answer.
  CONSTRAINT "leads_not_qualified_requires_reason"
    CHECK ("status" <> 'not_qualified' OR "not_qualified_reason" IS NOT NULL),
  CONSTRAINT "leads_converted_requires_opportunity"
    CHECK ("status" <> 'converted' OR "opportunity_id" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "leads_org_status_idx" ON "leads" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "leads_org_date_idx" ON "leads" ("organization_id", "enquiry_date");
