import "dotenv/config";

import { eq } from "drizzle-orm";

import { db } from "./index";
import {
  accounts,
  cities,
  lostReasons,
  opportunities,
  organizations,
  stageProbabilities,
  users,
  vehicleTypes,
} from "./schema";
import {
  DEFAULT_STAGE_PROBABILITY,
  SEED_CITIES,
  SEED_LOST_REASONS,
  SEED_VEHICLE_TYPES,
} from "../lib/constants";
import type { SalesStage } from "./schema";

/**
 * Bootstraps the MoEVing tenant and its master data. Safe to re-run: every
 * insert is onConflictDoNothing.
 *
 *   npm run db:seed                 -- org, master data, first admin
 *   npm run db:seed -- --demo       -- plus ~30 sample deals to click around
 */
async function main() {
  const slug = process.env.SEED_ORG_SLUG ?? "moeving";
  const orgName = process.env.SEED_ORG_NAME ?? "MoEVing";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "").toLowerCase();
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

  const [org] = await db
    .insert(organizations)
    .values({ name: orgName, slug })
    .onConflictDoNothing()
    .returning();

  const organization =
    org ??
    (await db.query.organizations.findFirst({ where: eq(organizations.slug, slug) }))!;
  const organizationId = organization.id;
  console.log(`org ${organization.name} (${organizationId})`);

  await db
    .insert(cities)
    .values(
      SEED_CITIES.map((name, i) => ({ organizationId, name, sortOrder: i })),
    )
    .onConflictDoNothing();
  await db
    .insert(vehicleTypes)
    .values(
      SEED_VEHICLE_TYPES.map((name, i) => ({ organizationId, name, sortOrder: i })),
    )
    .onConflictDoNothing();
  await db
    .insert(lostReasons)
    .values(
      SEED_LOST_REASONS.map((label, i) => ({ organizationId, label, sortOrder: i })),
    )
    .onConflictDoNothing();
  await db
    .insert(stageProbabilities)
    .values(
      Object.entries(DEFAULT_STAGE_PROBABILITY).map(([stage, probability]) => ({
        organizationId,
        stage: stage as SalesStage,
        probability,
      })),
    )
    .onConflictDoNothing();
  console.log("master data ready");

  if (adminEmail) {
    await db
      .insert(users)
      .values({
        organizationId,
        email: adminEmail,
        name: adminName,
        role: "admin",
      })
      .onConflictDoNothing();
    console.log(`admin ${adminEmail} — invite this email in Clerk`);
  } else {
    console.log("SEED_ADMIN_EMAIL not set; no admin created");
  }

  if (!process.argv.includes("--demo")) return;
  await seedDemo(organizationId);
}

async function seedDemo(organizationId: string) {
  const existing = await db.query.opportunities.findFirst({
    where: eq(opportunities.organizationId, organizationId),
  });
  if (existing) {
    console.log("demo data skipped — opportunities already exist");
    return;
  }

  const reps = [
    { name: "Saranyan R", email: "saranyan@example.com" },
    { name: "Moin Panwar", email: "moin@example.com" },
    { name: "Divya Nair", email: "divya@example.com" },
  ];
  const repRows = await db
    .insert(users)
    .values(reps.map((r) => ({ organizationId, ...r, role: "sales" as const })))
    .onConflictDoNothing()
    .returning();

  const cityRows = await db
    .select()
    .from(cities)
    .where(eq(cities.organizationId, organizationId));
  const vehicleRows = await db
    .select()
    .from(vehicleTypes)
    .where(eq(vehicleTypes.organizationId, organizationId));
  const reasonRows = await db
    .select()
    .from(lostReasons)
    .where(eq(lostReasons.organizationId, organizationId));

  const customers = [
    "Berger Paints", "Terrago", "TCI Express", "Ceva Logistics", "Asian Paints",
    "ITC Last Mile", "Reefer On", "Viro Foods", "Navata SCS", "Pro Connect",
    "Compass Microsoft", "Renito Distributors",
  ];
  const accountRows = await db
    .insert(accounts)
    .values(customers.map((name) => ({ organizationId, name })))
    .onConflictDoNothing()
    .returning();

  const stages: SalesStage[] = [
    "first_contact", "solutioning", "proposal", "negotiation",
    "closed_won", "closed_lost", "dormant",
  ];
  const pick = <T,>(arr: T[], i: number) => arr[i % arr.length]!;

  const rows = accountRows.flatMap((account, i) =>
    [0, 1, 2].map((k) => {
      const idx = i * 3 + k;
      const stage = pick(stages, idx);
      const fleetSize = [3, 5, 10, 15, 20, 25][idx % 6]!;
      const price = [38000, 45000, 56000, 68000, 74000, 105000][idx % 6]!;
      const month = new Date();
      month.setUTCMonth(month.getUTCMonth() + (idx % 5));
      const closeDate = new Date(
        Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
      )
        .toISOString()
        .slice(0, 10);

      const revenue = price * fleetSize;
      const won = stage === "closed_won";
      const share = (pct: number) => Math.round((revenue * pct) / 100);

      return {
        organizationId,
        accountId: account.id,
        name: account.name,
        stage,
        cityId: pick(cityRows, idx).id,
        vehicleTypeId: pick(vehicleRows, idx).id,
        driverType: pick(
          ["driver_only", "driver_plus_helper", "driver_cum_helper"] as const,
          idx,
        ),
        chargingScope: pick(["client", "moeving"] as const, idx),
        fleetSize,
        price,
        expectedCloseDate: closeDate,
        ownerUserId: pick(repRows, idx).id,
        notes: null,
        revenue: won ? revenue : null,
        leaseCost: won ? share(46) : null,
        driverCost: won ? share(22) : null,
        chargingCost: won ? share(9) : null,
        parkingCost: won ? share(3) : null,
        maintenanceCost: won ? share(4) : null,
        supervisorCost: won ? share(3) : null,
        miscCost: won ? share(2) : null,
        lostReasonId: stage === "closed_lost" ? pick(reasonRows, idx).id : null,
      };
    }),
  );

  await db.insert(opportunities).values(rows);
  console.log(`demo: ${repRows.length} reps, ${rows.length} opportunities`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
