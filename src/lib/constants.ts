import type { SalesStage } from "@/db/schema";

/**
 * The stage palette says what kind of state a deal is in, not just which one.
 *
 * It used to be eight unrelated hues — slate, sky, violet, amber, teal,
 * emerald, rose, orange — so nothing could be read at a glance and a deal in
 * Negotiation, the healthiest place an open deal can be, was painted the
 * colour every other screen uses for "late".
 *
 * Now there are four meanings, and the ramp inside the first one is progress:
 *
 *   open      a cool blue deepening slate → sky → blue → indigo → violet
 *   won       emerald
 *   lost      rose
 *   dormant   slate, drained of colour, because nothing is happening
 */
export const STAGES: {
  value: SalesStage;
  label: string;
  short: string;
  /** Tailwind classes for the stage chip. */
  chip: string;
  dot: string;
  open: boolean;
}[] = [
  {
    value: "first_contact",
    label: "First Contact",
    short: "Contact",
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    dot: "bg-slate-400",
    open: true,
  },
  {
    value: "solutioning",
    label: "Solutioning",
    short: "Solution",
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    dot: "bg-sky-500",
    open: true,
  },
  {
    value: "proposal",
    label: "Proposal",
    short: "Proposal",
    chip: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    dot: "bg-blue-500",
    open: true,
  },
  {
    value: "negotiation",
    label: "Negotiation",
    short: "Nego",
    chip: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
    dot: "bg-indigo-500",
    open: true,
  },
  {
    value: "contracting",
    label: "Contracting",
    short: "Contract",
    chip: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
    dot: "bg-violet-500",
    open: true,
  },
  {
    value: "closed_won",
    label: "Closed Won",
    short: "Won",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    dot: "bg-emerald-500",
    open: false,
  },
  {
    value: "closed_lost",
    label: "Closed Lost",
    short: "Lost",
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
    dot: "bg-rose-500",
    open: false,
  },
  {
    value: "dormant",
    label: "Dormant",
    short: "Dormant",
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-300",
    open: false,
  },
];

export const STAGE_MAP = Object.fromEntries(
  STAGES.map((s) => [s.value, s]),
) as Record<SalesStage, (typeof STAGES)[number]>;

export const OPEN_STAGES = STAGES.filter((s) => s.open).map((s) => s.value);

export const DEFAULT_STAGE_PROBABILITY: Record<SalesStage, number> = {
  first_contact: 10,
  solutioning: 25,
  proposal: 50,
  negotiation: 75,
  // They have said yes; nothing is signed.
  contracting: 90,
  closed_won: 100,
  closed_lost: 0,
  dormant: 0,
};

export const DRIVER_TYPES = [
  { value: "driver_only", label: "Driver Only" },
  { value: "driver_plus_helper", label: "Driver + Helper" },
  { value: "driver_cum_helper", label: "Driver-cum-Delivery" },
] as const;

export const CHARGING_SCOPES = [
  { value: "client", label: "Client" },
  { value: "moeving", label: "MoEVing" },
] as const;

export const DRIVER_TYPE_LABEL = Object.fromEntries(
  DRIVER_TYPES.map((d) => [d.value, d.label]),
) as Record<string, string>;

export const CHARGING_SCOPE_LABEL = Object.fromEntries(
  CHARGING_SCOPES.map((c) => [c.value, c.label]),
) as Record<string, string>;

export const SEED_CITIES = [
  "Delhi NCR",
  "Bangalore",
  "Hyderabad",
  "Mumbai",
  "Pune",
  "Kolkata",
];

export const SEED_VEHICLE_TYPES = ["1 Tonne", "1.7 Tonne", "Ultra E7", "Ultra E9"];

export const SEED_LOST_REASONS = [
  "Pricing mismatch",
  "Ops performance concerns",
  "Vehicle spec mismatch",
  "Timeline mismatch",
  "Lost to competitor",
  "Budget / funding",
  "No current requirement",
  "Other",
];

/**
 * Operating days a month, as the contracts are actually written: a six-day
 * week or every day. Recorded on the deal, never multiplied by anything —
 * `price` is the monthly rate under whichever one is chosen.
 */
export const OPERATING_DAYS = [
  { value: 26, label: "26 days", hint: "Six-day week" },
  { value: 30, label: "30 days", hint: "Every day" },
] as const;

/**
 * The seven running costs of one vehicle, and what each one varies by.
 *
 * `dimensions` is the whole design of the defaults table: it says, in code,
 * that a lease depends on the vehicle and nothing else, that charging depends
 * on the vehicle AND who pays for it, that maintenance depends on nothing.
 *
 * Declaring it beats inferring it. A table where "the most specific matching
 * row wins" cannot settle charging — a rule about a Tata Ace and a rule about
 * client-paid charging are equally specific and disagree — whereas a fixed
 * vehicle x scope grid has a row for "Ace, client pays" that is simply 0.
 */
export const COST_FIELDS = [
  { key: "leaseCost", label: "Lease", dimensions: ["vehicleType"] },
  { key: "driverCost", label: "Driver", dimensions: ["operatingDays"] },
  {
    key: "chargingCost",
    label: "Charging",
    dimensions: ["vehicleType", "chargingScope"],
  },
  { key: "parkingCost", label: "Parking", dimensions: ["chargingScope"] },
  { key: "maintenanceCost", label: "Maintenance", dimensions: [] },
  { key: "supervisorCost", label: "Supervisor", dimensions: [] },
  { key: "miscCost", label: "Miscellaneous", dimensions: [] },
] as const satisfies readonly {
  key: string;
  label: string;
  dimensions: readonly CostDimension[];
}[];

/** What a cost line can vary by. Each maps to a column on the deal. */
export type CostDimension = "vehicleType" | "chargingScope" | "operatingDays";

export type CostFieldKey = (typeof COST_FIELDS)[number]["key"];
