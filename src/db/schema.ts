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

const id = () => uuid("id").primaryKey().defaultRandom();
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

/* -------------------------------------------------------------------- sales */

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
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
      sql`${t.vehiclesDeployed} >= 0 and ${t.vehiclesDeployed} <= ${t.fleetSize}`,
    ),
    index("opps_org_deployment_idx").on(t.organizationId, t.deploymentDate),
  ],
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
