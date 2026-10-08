-- Signed customer agreements.
--
-- One row per uploaded file: the customer it belongs to, optionally the deal
-- it covers (null = the whole customer), its type (MSA / addendum / other),
-- the signed and renewal dates, and where the file sits in the PRIVATE Vercel
-- Blob store. Additive only — a new enum and a new table, nothing existing is
-- touched — so it is safe to apply before the code that reads it deploys.
--
-- Apply it BEFORE that code: the Pipeline reads this table to decide which
-- won deals show "No agreement".

CREATE TYPE "public"."agreement_type" AS ENUM('msa', 'addendum', 'other');--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"type" "agreement_type" NOT NULL,
	"signed_on" date NOT NULL,
	"renewal_on" date,
	"notes" text,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreements_renewal_after_signing" CHECK ("agreements"."renewal_on" is null or "agreements"."renewal_on" >= "agreements"."signed_on")
);
--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agreements_org_account_idx" ON "agreements" USING btree ("organization_id","account_id");--> statement-breakpoint
CREATE INDEX "agreements_org_renewal_idx" ON "agreements" USING btree ("organization_id","renewal_on");