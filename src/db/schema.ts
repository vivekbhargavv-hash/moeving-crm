import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Money is stored as whole rupees in `integer` columns. No paise, no floats,
 * no numeric-as-string round trips.
 *
 * Every money column is PER VEHICLE PER MONTH — `price` is the rent one truck
 * pays, and the Closed Won cost sheet is that truck's running cost. Deal-level
 * figures are always the per-vehicle number times fleet_size, so the app has
 * one unit and never mixes the two.
 */

export const userRole = pgEnum("user_role", [
  "admin",
  "sales",
  // The operations team. They see Deployments and nothing else — not the
  // pipeline, not a margin.
  "ops",
  // The desk that answers the phone. They write down inbound enquiries and
  // see nothing else: not the pipeline, not a margin, and not what a deal
  // owner eventually did with the lead.
  "noc",
]);

/**
 * How far an inbound enquiry got.
 *
 * Four words, because the sales stages on a deal already carry the detail and
 * a lead is only ever answering one question: is there a deal here? A lead
 * that is `qualified` has been spoken to and is worth pursuing; `converted`
 * is set by the app itself when the deal is actually raised, so nobody has to
 * remember to tick it.
 */
export const leadStatus = pgEnum("lead_status", [
  "new",
  "qualified",
  "not_qualified",
  "converted",
]);

export const salesStage = pgEnum("sales_stage", [
  "first_contact",
  "solutioning",
  "proposal",
  "negotiation",
  // Verbally agreed, paperwork in flight. Sits between Negotiation and Won so
  // the weighted pipeline can tell "they said yes" from "they signed".
  "contracting",
  "closed_won",
  "closed_lost",
  "dormant",
]);

export const driverType = pgEnum("driver_type", [
  "driver_only",
  "driver_plus_helper",
  "driver_cum_helper",
]);

export const chargingScope = pgEnum("charging_scope", ["client", "moeving"]);

export const eventKind = pgEnum("event_kind", [
  "created",
  "stage_changed",
  "updated",
  "note",
]);

/** What happened to some of a won deal's vehicles. */
export const deploymentEventKind = pgEnum("deployment_event_kind", [
  // Vehicles put on the road (negative: a count corrected downwards).
  "deployed",
  // Vehicles that will never go out — the demand, a truck or a driver went
  // away. Negative: a drop undone.
  "dropped",
]);

/** Why sold vehicles were not deployed. Fixed list (Vivek, 3 Nov). */
export const dropReason = pgEnum("drop_reason", [
  "vehicle_unavailable",
  "driver_unavailable",
  "charging_constraint",
  "demand_lost",
  "other",
]);

const id = () => uuid("id").primaryKey().defaultRandom();
/**
 * A short running number people can read and type — shown as L-0012,
 * D-0045, DP-0031 (`lib/record-ids.ts`). The uuid stays the real key; this is
 * for exports and conversation. Numbered by the database, never by the app,
 * so two saves at once cannot get the same one.
 */
const ref = () => integer("ref").notNull().generatedByDefaultAsIdentity();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ tenancy */

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").unique(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull().default("sales"),
    isActive: boolean("is_active").notNull().default(true),
    /** When Clerk was asked to email this person a sign-up invitation. */
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    /**
     * The accept link from that invitation, so onboarding survives an email
     * that never arrives. Cleared on first sign-in — see requireSession().
     */
    inviteUrl: text("invite_url"),
    /**
     * The last time this person had a page rendered for them.
     *
     * Written by `requireSession()`, throttled — see `lib/last-seen.ts`. Null
     * means they have never signed in, which is what Admin shows as "Invited".
     */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_org_email_idx").on(t.organizationId, t.email),
    index("users_org_idx").on(t.organizationId),
  ],
);

/* -------------------------------------------------------------- master data */

export const cities = pgTable(
  "cities",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("cities_org_name_idx").on(t.organizationId, t.name)],
);

export const vehicleTypes = pgTable(
  "vehicle_types",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("vehicle_types_org_name_idx").on(t.organizationId, t.name)],
);

export const lostReasons = pgTable(
  "lost_reasons",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("lost_reasons_org_label_idx").on(t.organizationId, t.label)],
);

/** Drives the weighted pipeline number on the dashboard. Admin-tunable. */
export const stageProbabilities = pgTable(
  "stage_probabilities",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stage: salesStage("stage").notNull(),
    probability: integer("probability").notNull(),
  },
  (t) => [
    uniqueIndex("stage_prob_org_stage_idx").on(t.organizationId, t.stage),
    check("stage_prob_range", sql`${t.probability} between 0 and 100`),
  ],
);

/**
 * What each cost line starts at, before anyone types.
 *
 * The same truck in the same city costs what it costs: a lease is a function
 * of the vehicle, a driver of how many days a month they work, charging of the
 * vehicle and of who pays for it. Those are facts about the business, not
 * about a deal — so they live here, an admin owns them, and the cost sheet
 * starts from them instead of from memory.
 *
 * Which dimensions a line varies by is declared in `COST_FIELDS`, not inferred
 * from the rows. That is the whole design: a table where "the most specific
 * matching row wins" cannot answer the charging case, where a rule about a
 * vehicle and a rule about a charging scope are equally specific and disagree.
 * With the dimensions fixed per line, charging is a vehicle x scope grid where
 * "Ace, client pays" is its own row worth 0, and nothing has to be arbitrated.
 *
 * A dimension not used by a line is null in every one of its rows.
 */
export const costDefaults = pgTable(
  "cost_defaults",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** A key of `COST_FIELDS` — lease_cost, driver_cost, and so on. */
    costKey: text("cost_key").notNull(),
    vehicleTypeId: uuid("vehicle_type_id").references(() => vehicleTypes.id, {
      onDelete: "cascade",
    }),
    chargingScope: chargingScope("charging_scope"),
    operatingDays: integer("operating_days"),
    /** Per vehicle per month, whole rupees. Zero is a real answer. */
    amount: integer("amount").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // NULLS NOT DISTINCT, because a line that does not use a dimension stores
    // null in it — and under the default rule every such row would count as
    // unique, letting one cost line collect a dozen contradictory defaults.
    unique("cost_defaults_combination_idx")
      .on(
        t.organizationId,
        t.costKey,
        t.vehicleTypeId,
        t.chargingScope,
        t.operatingDays,
      )
      .nullsNotDistinct(),
    check("cost_defaults_amount_positive", sql`${t.amount} >= 0`),
  ],
);

/**
 * An inbound enquiry, before anybody knows whether it is a deal.
 *
 * The NOC desk takes the call and writes down what was said — the columns are
 * the ones the team already kept in a shared spreadsheet, because that sheet
 * was the real specification. A deal owner then rings back, leaves a remark,
 * and either says why it is not a deal or turns it into one.
 *
 * It is a table of its own rather than a pipeline stage: most of these never
 * become deals, and a pipeline that fills up with enquiries nobody has
 * qualified stops being a forecast.
 */
export type LeadStatus = (typeof leadStatus.enumValues)[number];

export const leads = pgTable(
  "leads",
  {
    id: id(),
    /** Lead ID — L-0001. */
    ref: ref(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** The day the enquiry came in, which is not the day it was typed up. */
    enquiryDate: date("enquiry_date").notNull(),
    companyName: text("company_name").notNull(),
    typeOfGoods: text("type_of_goods"),
    /** How many vehicles they asked about. A count, not a commitment. */
    vehicleRequirement: integer("vehicle_requirement"),
    /** Free text, as the caller said it — the city list is for deals. */
    callingCity: text("calling_city"),
    /** "3W", "4W", or whatever the caller called it. */
    vehicleType: text("vehicle_type"),

    /* --- who rang --- */
    callerName: text("caller_name"),
    designation: text("designation"),
    mobile: text("mobile"),
    email: text("email"),
    /** Google search, referral, LinkedIn — where they found MoEVing. */
    foundOn: text("found_on"),
    /**
     * How the lead reached the CRM: "desk" (typed in on Leads) or "website"
     * (posted by the website chatbot to /api/leads/inbound). Text, not an
     * enum, so a new channel is not an ALTER TYPE migration.
     */
    source: text("source").notNull().default("desk"),

    status: leadStatus("status").notNull().default("new"),
    /**
     * What the deal owner learned on the call. Every lead gets one, which is
     * the point of the screen: a status with no sentence behind it tells the
     * next person nothing.
     */
    remarks: text("remarks"),
    /** Why it is not a deal. Required to say no, so a no is never a shrug. */
    notQualifiedReason: text("not_qualified_reason"),

    /** The deal this became, once somebody converted it. */
    opportunityId: uuid("opportunity_id").references(
      (): AnyPgColumn => opportunities.id,
      { onDelete: "set null" },
    ),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * The deal owner this lead is for. An admin assigns it, or a deal owner
     * takes an unassigned one; only that person (and admins) may then act on
     * it. Null means nobody's yet — any deal owner may pick it up.
     */
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    /** Who last rang the lead, and when — the desk's accountability. */
    actionedByUserId: uuid("actioned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * When a deal owner rang back and said yes or no.
     *
     * Deliberately NOT touched by conversion any more. Converting used to
     * overwrite it, which erased the one timestamp that says how long an
     * enquiry waited for its call — the number the desk is actually measured
     * on — and replaced it with a moment we already record below.
     */
    actionedAt: timestamp("actioned_at", { withTimezone: true }),
    /**
     * When the lead became a deal. `created_at` → `actioned_at` →
     * `converted_at` is the funnel: how fast we call back, and how many of
     * those calls turn into something.
     */
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("leads_ref_idx").on(t.ref),
    index("leads_org_status_idx").on(t.organizationId, t.status),
    index("leads_org_created_idx").on(t.organizationId, t.createdAt),
    index("leads_org_date_idx").on(t.organizationId, t.enquiryDate),
    // "How many leads are waiting on me" is asked on every page a deal owner
    // opens, for the badge on the Leads tab.
    index("leads_org_assignee_idx").on(t.organizationId, t.assignedToUserId, t.status),
    // A no has to carry its reason, and a lead that became a deal has to know
    // which one — enforced here so no code path can write a half-answer.
    check(
      "leads_not_qualified_requires_reason",
      sql`${t.status} <> 'not_qualified' or ${t.notQualifiedReason} is not null`,
    ),
    check(
      "leads_converted_requires_opportunity",
      sql`${t.status} <> 'converted' or ${t.opportunityId} is not null`,
    ),
  ],
);

/* --------------------------------------------------------------------- push */

/**
 * One row per browser that agreed to notifications. A person with the app on
 * a phone and a laptop has two. The endpoint is the push service's address for
 * that browser; the keys encrypt what is sent to it.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId),
  ],
);

/**
 * Keys a website chatbot (or Zapier, or a web form) uses to post leads into
 * the CRM — `/api/leads/inbound`.
 *
 * Only a SHA-256 of the key is stored: the key itself is shown to the admin
 * once, when it is made, and cannot be read back. The key alone names the
 * organization, which is why this is the one door to a tenant that is not
 * `requireSession()`. Revoked keys are kept, so "which key sent this" still
 * has an answer.
 */
export const leadIntakeKeys = pgTable(
  "lead_intake_keys",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** What the admin called it — "Website chatbot". */
    label: text("label").notNull(),
    keyHash: text("key_hash").notNull(),
    /** The key's first characters, so a person can tell two keys apart. */
    keyPrefix: text("key_prefix").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    leadsReceived: integer("leads_received").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("lead_intake_keys_hash_idx").on(t.keyHash),
    index("lead_intake_keys_org_idx").on(t.organizationId),
  ],
);

/* -------------------------------------------------------------------- sales */

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /**
     * A key account leadership watches.
     *
     * Any customer can have meetings logged against it; this flag only decides
     * who appears on the Meetings board and who gets chased for going quiet.
     * An admin sets it.
     */
    isStrategic: boolean("is_strategic").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("accounts_org_name_idx").on(t.organizationId, t.name)],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: id(),
    /** Deal ID — D-0001. */
    ref: ref(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    stage: salesStage("stage").notNull().default("first_contact"),

    cityId: uuid("city_id").references(() => cities.id, { onDelete: "set null" }),
    vehicleTypeId: uuid("vehicle_type_id").references(() => vehicleTypes.id, {
      onDelete: "set null",
    }),
    driverType: driverType("driver_type"),
    chargingScope: chargingScope("charging_scope"),

    fleetSize: integer("fleet_size").notNull().default(1),
    /**
     * Monthly rent per vehicle, whole rupees.
     *
     * The ONE rate on a deal. `revenue` in the Closed Won block is the same
     * figure — the money a vehicle earns per month — and is written from here
     * rather than asked for twice, because two fields for one number is two
     * numbers that disagree.
     */
    price: integer("price"),
    /**
     * Operating days a month the contract runs on: 26 for a six-day week, 30
     * for every day. Recorded, not arithmetic — `price` is the monthly rate
     * whichever is chosen, and nothing computes from this. It is here because
     * the same monthly rent means a different day rate at 26 days than at 30,
     * and that is the first thing anyone asks when comparing two deals.
     *
     * Nullable: every deal raised before this field existed has no answer,
     * and guessing one would be inventing a contract term.
     */
    operatingDays: integer("operating_days"),
    /** A sales forecast of when the deal closes. Not a deployment date. */
    expectedCloseDate: date("expected_close_date"),

    /* --- operations --- */
    /**
     * When the vehicles are due on the road, captured at the moment the deal
     * is won. `expected_close_date` is a forecast of a different thing and is
     * routinely months stale by then, so ops gets its own column.
     */
    deploymentDate: date("deployment_date"),
    /**
     * How many of `fleet_size` are actually out. A count, not a flag: part of
     * a fleet going first is normal, and "8 of 12" is the honest state.
     */
    vehiclesDeployed: integer("vehicles_deployed").notNull().default(0),
    /**
     * How many of `fleet_size` will never go out — sold, then lost to a
     * missing truck, driver, charger or the demand itself. `fleet_size` stays
     * what was sold, so the win is never restated; deployed + dropped =
     * fleet_size is what closes the deal on the Deployments queue. Each
     * change is a row in `deployment_events`, with its reason.
     */
    vehiclesDropped: integer("vehicles_dropped").notNull().default(0),

    /** Deal Owner — the person who owns this deal. */
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    notes: text("notes"),

    /**
     * Repeat business. A won customer asking for more trucks is a NEW deal
     * pointing back at the one it grew out of — never an edit to the won row,
     * which would move a recorded win out of the month it happened in.
     *
     * Self-referencing and nullable: the first deal in a chain has no parent,
     * and deleting a parent leaves the expansion standing on its own.
     */
    parentOpportunityId: uuid("parent_opportunity_id").references(
      (): AnyPgColumn => opportunities.id,
      { onDelete: "set null" },
    ),

    /* --- Closed Won block: null until the deal is won.
       Every figure here is PER VEHICLE PER MONTH, matching `price` above. --- */
    revenue: integer("revenue"),
    leaseCost: integer("lease_cost"),
    driverCost: integer("driver_cost"),
    chargingCost: integer("charging_cost"),
    parkingCost: integer("parking_cost"),
    maintenanceCost: integer("maintenance_cost"),
    supervisorCost: integer("supervisor_cost"),
    miscCost: integer("misc_cost"),

    /**
     * Postgres computes these, so no two screens can disagree.
     *
     * Everything above is PER VEHICLE PER MONTH — the unit economics of one
     * truck. Deal-level numbers are that times the fleet, which means a change
     * to fleet_size rescales the whole deal automatically.
     */
    costPerVehicle: integer("cost_per_vehicle").generatedAlwaysAs(
      sql`coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0) + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0) + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0)`,
    ),
    marginPerVehicle: integer("margin_per_vehicle").generatedAlwaysAs(
      sql`coalesce(revenue, 0) - (coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0) + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0) + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0))`,
    ),
    totalRevenue: integer("total_revenue").generatedAlwaysAs(
      sql`coalesce(revenue, 0) * fleet_size`,
    ),
    totalCost: integer("total_cost").generatedAlwaysAs(
      sql`(coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0) + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0) + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0)) * fleet_size`,
    ),
    grossMargin: integer("gross_margin").generatedAlwaysAs(
      sql`(coalesce(revenue, 0) - (coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0) + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0) + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0))) * fleet_size`,
    ),
    /** Identical per vehicle and per deal — the fleet cancels out. */
    marginPct: numeric("margin_pct", { precision: 7, scale: 2 }).generatedAlwaysAs(
      sql`case when coalesce(revenue, 0) > 0 then round(((coalesce(revenue, 0) - (coalesce(lease_cost, 0) + coalesce(driver_cost, 0) + coalesce(charging_cost, 0) + coalesce(parking_cost, 0) + coalesce(maintenance_cost, 0) + coalesce(supervisor_cost, 0) + coalesce(misc_cost, 0)))::numeric * 100) / revenue, 2) else null end`,
    ),

    /* --- Closed Lost block --- */
    lostReasonId: uuid("lost_reason_id").references(() => lostReasons.id, {
      onDelete: "set null",
    }),
    lostReasonNote: text("lost_reason_note"),

    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("opps_org_stage_idx").on(t.organizationId, t.stage),
    index("opps_org_owner_idx").on(t.organizationId, t.ownerUserId),
    index("opps_org_close_idx").on(t.organizationId, t.expectedCloseDate),
    index("opps_org_city_close_idx").on(
      t.organizationId,
      t.cityId,
      t.expectedCloseDate,
    ),
    index("opps_parent_idx").on(t.parentOpportunityId),
    check("opps_fleet_positive", sql`${t.fleetSize} > 0`),
    // A won deal must carry its full cost sheet. Enforced here so no code path,
    // present or future, can write a half-filled Closed Won row.
    check(
      "opps_won_requires_costs",
      sql`${t.stage} <> 'closed_won' or (
        ${t.revenue} is not null and ${t.leaseCost} is not null and ${t.driverCost} is not null
        and ${t.chargingCost} is not null and ${t.parkingCost} is not null
        and ${t.maintenanceCost} is not null and ${t.supervisorCost} is not null
        and ${t.miscCost} is not null)`,
    ),
    check(
      "opps_lost_requires_reason",
      sql`${t.stage} <> 'closed_lost' or ${t.lostReasonId} is not null`,
    ),
    // A won deal ops cannot schedule is a won deal ops will forget about.
    check(
      "opps_won_requires_deployment_date",
      sql`${t.stage} <> 'closed_won' or ${t.deploymentDate} is not null`,
    ),
    check(
      "opps_deployed_within_fleet",
      sql`${t.vehiclesDeployed} >= 0 and ${t.vehiclesDropped} >= 0 and ${t.vehiclesDeployed} + ${t.vehiclesDropped} <= ${t.fleetSize}`,
    ),
    uniqueIndex("opps_ref_idx").on(t.ref),
    index("opps_org_deployment_idx").on(t.organizationId, t.deploymentDate),
  ],
);

/* --------------------------------------------------------------- agreements */

/**
 * What kind of paper it is. A customer usually signs one master agreement;
 * some sign one per deal; and any change after signing is an addendum.
 */
export const agreementType = pgEnum("agreement_type", ["msa", "addendum", "other"]);

/**
 * A signed customer agreement: the file, and the dates that matter about it.
 *
 * It belongs to the CUSTOMER, because that is who signed it, and may name the
 * one deal it covers. An agreement naming no deal covers every deal for that
 * customer — the usual case, one MSA — which is how a won deal decides whether
 * it has paper behind it.
 *
 * The file itself lives in Vercel Blob, in a PRIVATE store: `blob_url` cannot
 * be opened by anyone holding it. The app streams the file through
 * /api/agreements/<id>, which checks the person is a deal owner or an admin of
 * this organization first. Ops and NOC never see one — the agreement carries
 * the price.
 */
export const agreements = pgTable(
  "agreements",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // RESTRICT: deleting a customer must not quietly orphan signed contracts
    // in blob storage.
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    /** The deal it covers, when it covers one. Null means the whole customer. */
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    type: agreementType("type").notNull(),
    signedOn: date("signed_on").notNull(),
    /**
     * When it is up for renewal. Required (Vivek, 8 Oct): every agreement
     * gets a date somebody will be reminded of — an addendum takes the date
     * of the agreement it amends.
     */
    renewalOn: date("renewal_on").notNull(),
    notes: text("notes"),

    blobUrl: text("blob_url").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),

    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("agreements_org_account_idx").on(t.organizationId, t.accountId),
    index("agreements_org_renewal_idx").on(t.organizationId, t.renewalOn),
    check(
      "agreements_renewal_after_signing",
      sql`${t.renewalOn} >= ${t.signedOn}`,
    ),
  ],
);

/**
 * The deployment log: every change to how many of a deal's vehicles went out
 * or were dropped, one row each, with its Deployment ID (DP-0001).
 *
 * `opportunities.vehicles_deployed` / `vehicles_dropped` are the running
 * totals the screens read; this is where WHEN and WHY live. `vehicles` is the
 * change, so the rows for a deal add up to its totals.
 */
export const deploymentEvents = pgTable(
  "deployment_events",
  {
    id: id(),
    /** Deployment ID — DP-0001. */
    ref: ref(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    kind: deploymentEventKind("kind").notNull(),
    /** The change: +4 deployed, +3 dropped, −1 a correction. Never 0. */
    vehicles: integer("vehicles").notNull(),
    /**
     * The day it happened, in India. Null only on the rows carried over from
     * before the log existed, when nobody recorded a day.
     */
    happenedOn: date("happened_on"),
    reason: dropReason("reason"),
    note: text("note"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("deployment_events_ref_idx").on(t.ref),
    index("deployment_events_opp_idx").on(t.opportunityId, t.createdAt),
    index("deployment_events_org_idx").on(t.organizationId, t.createdAt),
    check("deployment_events_nonzero", sql`${t.vehicles} <> 0`),
    // Dropping vehicles has to say why; "Others" has to say what.
    check(
      "deployment_events_drop_requires_reason",
      sql`${t.kind} <> 'dropped' or ${t.vehicles} < 0 or ${t.reason} is not null`,
    ),
    check(
      "deployment_events_other_requires_note",
      sql`${t.reason} is distinct from 'other' or ${t.note} is not null`,
    ),
  ],
);

/* ---------------------------------------------------------- meetings */

/**
 * Who was in the room, which is the whole reason this module exists.
 *
 * `leadership` is a CXO conversation — the one leadership has and then hands
 * down. `regional` is the deal owner's follow-up in a city. `operational` is
 * the monthly review with the people who run the fleet. The level is what
 * lets the board say "this account has only been touched regionally since
 * March".
 */
export const meetingLevel = pgEnum("meeting_level", [
  "leadership",
  "regional",
  "operational",
]);

export const meetingKind = pgEnum("meeting_kind", ["in_person", "call", "video"]);

/**
 * A meeting in the future is `planned`, one in the past is `held`. One table
 * for both, so the thread reads straight through and there is no calendar to
 * keep in step with it.
 */
export const meetingStatus = pgEnum("meeting_status", [
  "planned",
  "held",
  "cancelled",
]);

export const followUpStatus = pgEnum("follow_up_status", ["open", "done", "dropped"]);

/**
 * A person at the customer's end.
 *
 * Until now a person was free text on a lead (`caller_name`, `designation`)
 * and nothing was reusable, so "which CXOs have we actually sat in front of
 * this year" had no answer. These rows are that answer.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "Chief Supply Chain Officer". What makes a name worth recording. */
    designation: text("designation"),
    email: text("email"),
    mobile: text("mobile"),
    /** Someone who can say yes. Drives the CXO coverage count. */
    isDecisionMaker: boolean("is_decision_maker").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("contacts_account_name_idx").on(t.accountId, t.name),
    index("contacts_org_account_idx").on(t.organizationId, t.accountId),
  ],
);

/**
 * One meeting with a customer: who was there, what was said, and what it is
 * a follow-up to.
 *
 * It hangs off the CUSTOMER, not a deal. A CXO conversation touches three
 * deals or none, and the relationship outlives every one of them; the deal is
 * an optional pointer for the times a meeting really was about one.
 *
 * `parent_meeting_id` is the same device as `opportunities.parent_opportunity_id`:
 * a regional follow-up points back at the leadership meeting it came out of,
 * so the chain from "the CSCO asked for Pune" to what happened on the ground
 * reads top to bottom with nothing restated.
 */
export const meetings = pgTable(
  "meetings",
  {
    id: id(),
    /** Meeting ID — M-0001. */
    ref: ref(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // RESTRICT, like agreements: deleting a customer must not be how a
    // record of what their CEO promised quietly disappears.
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    /** The deal it concerned, when it concerned one. */
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    cityId: uuid("city_id").references(() => cities.id, { onDelete: "set null" }),
    /** The meeting this one came out of. Null for a new conversation. */
    parentMeetingId: uuid("parent_meeting_id").references(
      (): AnyPgColumn => meetings.id,
      { onDelete: "set null" },
    ),

    level: meetingLevel("level").notNull(),
    kind: meetingKind("kind").notNull().default("in_person"),
    status: meetingStatus("status").notNull().default("held"),
    /** The day it happened, or is due to happen, in India. */
    metOn: date("met_on").notNull(),
    /** One line a person can scan in a thread — "Annual review, Pune ask". */
    title: text("title").notNull(),
    /** What it is for. The only thing a planned meeting can carry. */
    agenda: text("agenda"),
    /** What was actually discussed. Required once it is held. */
    notes: text("notes"),
    /**
     * Admins only. Off by default — a regional owner cannot follow up on a
     * promise they are not allowed to read (Vivek, 27 Nov).
     */
    confidential: boolean("confidential").notNull().default(false),

    /**
     * Whose meeting it is — normally whoever led it.
     *
     * Separate from `created_by_user_id` on purpose: a CXO meeting is written
     * up by the account owner or an assistant, and the log should say who was
     * in the room rather than who did the typing.
     */
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("meetings_ref_idx").on(t.ref),
    index("meetings_org_account_idx").on(t.organizationId, t.accountId, t.metOn),
    index("meetings_org_date_idx").on(t.organizationId, t.metOn),
    index("meetings_org_status_idx").on(t.organizationId, t.status, t.metOn),
    index("meetings_parent_idx").on(t.parentMeetingId),
    // A meeting that happened has to say what was said, or the next person
    // learns nothing from it — the same rule as a lead's remarks.
    check(
      "meetings_held_requires_notes",
      sql`${t.status} <> 'held' or ${t.notes} is not null`,
    ),
  ],
);

/**
 * One row per person in the room — `user_id` for our side, `contact_id` for
 * theirs, never both.
 */
export const meetingAttendees = pgTable(
  "meeting_attendees",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [
    // NULLS DISTINCT (the default) is what makes these work: a meeting has
    // many rows with a null user_id, one per customer attendee.
    uniqueIndex("meeting_attendees_user_idx").on(t.meetingId, t.userId),
    uniqueIndex("meeting_attendees_contact_idx").on(t.meetingId, t.contactId),
    check(
      "meeting_attendees_one_side",
      sql`(${t.userId} is not null) <> (${t.contactId} is not null)`,
    ),
  ],
);

/**
 * What we committed to, or what they did. The point of the module.
 *
 * Notes alone make a diary nobody reads; a row here has an owner and a date,
 * which is what the board reads to say whether an account is on track and who
 * is late. Exactly one of `owner_user_id` / `owner_contact_id` is set, so
 * "the ball is with the customer" is a fact in the data rather than a
 * sentence buried in the notes.
 */
export const meetingFollowUps = pgTable(
  "meeting_follow_ups",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ownerContactId: uuid("owner_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /** Required: a follow-up with no date is one nobody is ever chased for. */
    dueOn: date("due_on").notNull(),
    status: followUpStatus("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Required to drop one, so a dropped follow-up is never a shrug. */
    closedNote: text("closed_note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("follow_ups_meeting_idx").on(t.meetingId),
    // "What is due on me" is the first thing a deal owner opens.
    index("follow_ups_org_owner_idx").on(t.organizationId, t.ownerUserId, t.status),
    index("follow_ups_org_due_idx").on(t.organizationId, t.status, t.dueOn),
    check(
      "follow_ups_one_owner",
      sql`(${t.ownerUserId} is not null) <> (${t.ownerContactId} is not null)`,
    ),
    check(
      "follow_ups_closed_has_moment",
      sql`${t.status} = 'open' or ${t.closedAt} is not null`,
    ),
    check(
      "follow_ups_dropped_requires_note",
      sql`${t.status} <> 'dropped' or ${t.closedNote} is not null`,
    ),
  ],
);

/**
 * What strategic customers keep raising — pricing pressure, charging infra, a
 * new city. Admin-managed, like `lost_reasons`, so the list stays short
 * enough to be worth counting.
 */
export const meetingTopics = pgTable(
  "meeting_topics",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("meeting_topics_org_label_idx").on(t.organizationId, t.label)],
);

export const meetingTopicLinks = pgTable(
  "meeting_topic_links",
  {
    id: id(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => meetingTopics.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("meeting_topic_links_idx").on(t.meetingId, t.topicId)],
);

export const opportunityEvents = pgTable(
  "opportunity_events",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: eventKind("kind").notNull(),
    fromStage: salesStage("from_stage"),
    toStage: salesStage("to_stage"),
    body: text("body"),
    createdAt: createdAt(),
  },
  (t) => [index("opp_events_opp_idx").on(t.opportunityId, t.createdAt)],
);

export type Opportunity = typeof opportunities.$inferSelect;
export type User = typeof users.$inferSelect;
export type SalesStage = (typeof salesStage.enumValues)[number];
export type AgreementType = (typeof agreementType.enumValues)[number];
export type DropReason = (typeof dropReason.enumValues)[number];
export type MeetingLevel = (typeof meetingLevel.enumValues)[number];
export type MeetingKind = (typeof meetingKind.enumValues)[number];
export type MeetingStatus = (typeof meetingStatus.enumValues)[number];
export type FollowUpStatus = (typeof followUpStatus.enumValues)[number];
export type Contact = typeof contacts.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
