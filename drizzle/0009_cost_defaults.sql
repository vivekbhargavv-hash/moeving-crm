-- What each cost line starts at, before anyone types.
--
-- A lease is a function of the vehicle; a driver of how many days a month they
-- work; charging of the vehicle and of who pays for it. Those are facts about
-- the business rather than about a deal, so an admin owns them here and the
-- cost sheet starts from them instead of from memory.
--
-- Which dimensions a line varies by is declared in code (COST_FIELDS), not
-- inferred from these rows: a "most specific match wins" table cannot settle
-- the charging case, where a rule about a vehicle and a rule about a charging
-- scope are equally specific and disagree. A dimension a line does not use is
-- null in every one of its rows.
--
-- NULLS NOT DISTINCT on the unique constraint for that reason: under Postgres'
-- default, every row with a null dimension counts as unique, and one cost line
-- could collect a dozen contradictory defaults.

CREATE TABLE IF NOT EXISTS "cost_defaults" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "cost_key" text NOT NULL,
  "vehicle_type_id" uuid REFERENCES "vehicle_types"("id") ON DELETE cascade,
  "charging_scope" "charging_scope",
  "operating_days" integer,
  "amount" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cost_defaults_combination_idx" UNIQUE NULLS NOT DISTINCT
    ("organization_id", "cost_key", "vehicle_type_id", "charging_scope", "operating_days"),
  CONSTRAINT "cost_defaults_amount_positive" CHECK ("amount" >= 0)
);
