import { sql } from "drizzle-orm";
import {
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

export const userRole = pgEnum("user_role", ["admin", "sales"]);

export const salesStage = pgEnum("sales_stage", [
  "first_contact",
  "solutioning",
  "proposal",
  "negotiation",
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
    /** Monthly rent per vehicle, whole rupees. */
    price: integer("price"),
    expectedCloseDate: date("expected_close_date"),

    /** Deal Owner — the person who owns this deal. */
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    notes: text("notes"),

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
