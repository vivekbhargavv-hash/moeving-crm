-- Website chatbot leads (Vivek, 26 Nov).
--
-- 1. lead_intake_keys: the keys a website chatbot uses to post leads to
--    /api/leads/inbound. Only a SHA-256 of each key is stored.
-- 2. leads.source: "desk" (typed in on Leads) or "website" (posted in).
--    Every existing lead is a desk lead, which the default says.
--
-- Additive only. Apply it BEFORE the code deploys: the Leads screen selects
-- leads.source on every load. Plain statements, no DO blocks, so the Neon
-- connector can run it as is.

CREATE TABLE "lead_intake_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"leads_received" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source" text DEFAULT 'desk' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_intake_keys" ADD CONSTRAINT "lead_intake_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_intake_keys" ADD CONSTRAINT "lead_intake_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_intake_keys_hash_idx" ON "lead_intake_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "lead_intake_keys_org_idx" ON "lead_intake_keys" USING btree ("organization_id");