import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ₹1,05,000 — full Indian grouping, no decimals. */
export function inr(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

/** ₹1.05L / ₹2.4Cr — for tiles and axis labels where width is scarce. */
export function inrCompact(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(0)}K`;
  return `₹${value}`;
}

export function num(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN").format(value);
}



function monthKey(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, 1));
  return date
    .toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })
    .slice(0, 3);
}

/** "2026-09" -> "Sep-26" — how the team writes a closing month. */
export function monthLabelShort(key: string) {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, 1));
  // en-IN renders September as "Sept"; the team writes three letters.
  const month = date
    .toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })
    .slice(0, 3);
  return `${month}-${String(y!).slice(2)}`;
}

export function monthLabelLong(key: string) {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, 1));
  return date.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The next `count` month keys starting from the current month, UTC. */
export function upcomingMonths(count: number, from = new Date()) {
  const keys: string[] = [];
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setUTCMonth(base.getUTCMonth() + i);
    keys.push(monthKey(d));
  }
  return keys;
}

/** The last `count` month keys ending with the current month, UTC. */
export function pastMonths(count: number, from = new Date()) {
  const keys: string[] = [];
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCMonth(base.getUTCMonth() - i);
    keys.push(monthKey(d));
  }
  return keys;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const day = d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "UTC" });
  const month = d
    .toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })
    .slice(0, 3);
  const year = d.toLocaleDateString("en-IN", { year: "2-digit", timeZone: "UTC" });
  return `${day} ${month} ${year}`;
}

/** Whole days from today to `value`; negative once it is in the past. */
export function daysUntil(value: string | null | undefined, from = new Date()) {
  if (!value) return null;
  const target = new Date(value).getTime();
  const today = from;
  const start = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.round((target - start) / 86_400_000);
}
