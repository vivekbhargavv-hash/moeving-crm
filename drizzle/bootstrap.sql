CREATE TYPE "public"."charging_scope" AS ENUM('client', 'moeving');
CREATE TYPE "public"."driver_type" AS ENUM('driver_only', 'driver_plus_helper', 'driver_cum_helper');
CREATE TYPE "public"."event_kind" AS ENUM('created', 'stage_changed', 'updated', 'note');
CREATE TYPE "public"."sales_stage" AS ENUM('first_contact', 'solutioning', 'proposal', 'negotiation', 'contracting', 'closed_won', 'closed_lost', 'dormant');
CREATE TYPE "public"."user_role" AS ENUM('admin', 'sales', 'ops');
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "lost_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"stage" "sales_stage" DEFAULT 'first_contact' NOT NULL,
	"city_id" uuid,
	"vehicle_type_id" uuid,
	"driver_type" "driver_type",
	"charging_scope" charging_scope,
	"fleet_size" integer DEFAULT 1 NOT NULL,
	"price" integer,
	"expected_close_date" date,
	"deployment_date" date,
	"vehicles_deployed" integer DEFAULT 0 NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"notes" text,
	"parent_opportunity_id" uuid,
	"revenue" integer,
	"lease_cost" integer,
	"driver_cost" integer,
	"charging_cost" integer,
	"parking_cost" integer,
	"maintenance_cost" integer,
	"supervisor_cost" integer,
	"misc_cost" integer,
	"total_cost" integer GENERATED ALWAYS AS (coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0) + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0) + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0)) STORED,
	"gross_margin" integer GENERATED ALWAYS AS (coalesce(revenue, 0) - (coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0) + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0) + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0))) STORED,
	"margin_pct" numeric(7, 2) GENERATED ALWAYS AS (case when coalesce(revenue, 0) > 0 then round(((coalesce(revenue, 0) - (coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0) + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0) + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0)))::numeric * 100) / revenue, 2) else null end) STORED,
	"lost_reason_id" uuid,
	"lost_reason_note" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opps_fleet_positive" CHECK ("opportunities"."fleet_size" > 0),
	CONSTRAINT "opps_won_requires_costs" CHECK ("opportunities"."stage" <> 'closed_won' or (
        "opportunities"."revenue" is not null and "opportunities"."lease_cost" is not null and "opportunities"."driver_cost" is not null
        and "opportunities"."charging_cost" is not null and "opportunities"."parking_cost" is not null
        and "opportunities"."maintenance_cost" is not null and "opportunities"."supervisor_cost" is not null
        and "opportunities"."misc_cost" is not null)),
	CONSTRAINT "opps_lost_requires_reason" CHECK ("opportunities"."stage" <> 'closed_lost' or "opportunities"."lost_reason_id" is not null)
);

CREATE TABLE "opportunity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" "event_kind" NOT NULL,
	"from_stage" "sales_stage",
	"to_stage" "sales_stage",
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);

CREATE TABLE "stage_probabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stage" "sales_stage" NOT NULL,
	"probability" integer NOT NULL,
	CONSTRAINT "stage_prob_range" CHECK ("stage_probabilities"."probability" between 0 and 100)
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"clerk_user_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'sales' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"invited_at" timestamp with time zone,
	"invite_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);

CREATE TABLE "vehicle_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "cities" ADD CONSTRAINT "cities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lost_reasons" ADD CONSTRAINT "lost_reasons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_vehicle_type_id_vehicle_types_id_fk" FOREIGN KEY ("vehicle_type_id") REFERENCES "public"."vehicle_types"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_parent_opportunity_id_opportunities_id_fk" FOREIGN KEY ("parent_opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lost_reason_id_lost_reasons_id_fk" FOREIGN KEY ("lost_reason_id") REFERENCES "public"."lost_reasons"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stage_probabilities" ADD CONSTRAINT "stage_probabilities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vehicle_types" ADD CONSTRAINT "vehicle_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "accounts_org_name_idx" ON "accounts" USING btree ("organization_id","name");
CREATE UNIQUE INDEX "cities_org_name_idx" ON "cities" USING btree ("organization_id","name");
CREATE UNIQUE INDEX "lost_reasons_org_label_idx" ON "lost_reasons" USING btree ("organization_id","label");
ALTER TABLE "opportunities" ADD CONSTRAINT "opps_won_requires_deployment_date" CHECK ("stage" <> 'closed_won' OR "deployment_date" IS NOT NULL);
ALTER TABLE "opportunities" ADD CONSTRAINT "opps_deployed_within_fleet" CHECK ("vehicles_deployed" >= 0 AND "vehicles_deployed" <= "fleet_size");
CREATE INDEX "opps_org_deployment_idx" ON "opportunities" USING btree ("organization_id","deployment_date");
CREATE INDEX "opps_org_stage_idx" ON "opportunities" USING btree ("organization_id","stage");
CREATE INDEX "opps_org_owner_idx" ON "opportunities" USING btree ("organization_id","owner_user_id");
CREATE INDEX "opps_parent_idx" ON "opportunities" USING btree ("parent_opportunity_id");
CREATE INDEX "opps_org_close_idx" ON "opportunities" USING btree ("organization_id","expected_close_date");
CREATE INDEX "opps_org_city_close_idx" ON "opportunities" USING btree ("organization_id","city_id","expected_close_date");
CREATE INDEX "opp_events_opp_idx" ON "opportunity_events" USING btree ("opportunity_id","created_at");
CREATE UNIQUE INDEX "stage_prob_org_stage_idx" ON "stage_probabilities" USING btree ("organization_id","stage");
CREATE UNIQUE INDEX "users_org_email_idx" ON "users" USING btree ("organization_id","email");
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");
CREATE UNIQUE INDEX "vehicle_types_org_name_idx" ON "vehicle_types" USING btree ("organization_id","name");
-- ============================================================
-- Bootstrap data: the MoEVing tenant, its master data, and the
-- first admin. Safe to re-run — every insert is idempotent.
-- ============================================================

INSERT INTO organizations (name, slug) VALUES ('MoEVing', 'moeving')
  ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (organization_id, email, name, role)
SELECT id, 'vivekbhargav.v@gmail.com', 'Vivek', 'admin' FROM organizations WHERE slug = 'moeving'
  ON CONFLICT DO NOTHING;

INSERT INTO cities (organization_id, name, sort_order)
SELECT o.id, c.name, c.ord FROM organizations o,
  (VALUES ('Delhi NCR',0),('Bangalore',1),('Hyderabad',2),
          ('Mumbai',3),('Pune',4),('Kolkata',5)) AS c(name, ord)
WHERE o.slug = 'moeving' ON CONFLICT DO NOTHING;

INSERT INTO vehicle_types (organization_id, name, sort_order)
SELECT o.id, v.name, v.ord FROM organizations o,
  (VALUES ('1 Tonne',0),('1.7 Tonne',1),('Ultra E7',2),('Ultra E9',3)) AS v(name, ord)
WHERE o.slug = 'moeving' ON CONFLICT DO NOTHING;

INSERT INTO lost_reasons (organization_id, label, sort_order)
SELECT o.id, r.label, r.ord FROM organizations o,
  (VALUES ('Pricing mismatch',0),('Ops performance concerns',1),('Vehicle spec mismatch',2),
          ('Timeline mismatch',3),('Lost to competitor',4),('Budget / funding',5),
          ('No current requirement',6),('Other',7)) AS r(label, ord)
WHERE o.slug = 'moeving' ON CONFLICT DO NOTHING;

INSERT INTO stage_probabilities (organization_id, stage, probability)
SELECT o.id, s.stage::sales_stage, s.pct FROM organizations o,
  (VALUES ('first_contact',10),('solutioning',25),('proposal',50),('negotiation',75),
          ('contracting',90),('closed_won',100),('closed_lost',0),('dormant',0)) AS s(stage, pct)
WHERE o.slug = 'moeving' ON CONFLICT DO NOTHING;
