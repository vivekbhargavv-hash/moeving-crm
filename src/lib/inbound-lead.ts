/**
 * Turning whatever a website chatbot posts into a lead.
 *
 * Chatbots, form builders and Zapier all name their fields differently —
 * "phone", "Mobile Number", "whatsapp", "contact_no" — so each lead field
 * accepts a list of names, matched ignoring case, spaces, dashes and
 * underscores. The list IS the contract given to the website developer
 * (docs/website-leads-api.md); change one, change the other.
 *
 * A chatbot cannot fix what a visitor typed, so this is forgiving: text too
 * long is cut, not refused; a vehicle count of "5 trucks" is read as 5; an
 * unknown field is ignored. Only one thing refuses a lead — no phone number
 * and no email, because then nobody can ring back.
 *
 * Kept free of Next and the database, so the matching is tested.
 */

export type InboundLead = {
  enquiryDate: string;
  companyName: string;
  callerName: string | null;
  mobile: string | null;
  email: string | null;
  callingCity: string | null;
  vehicleType: string | null;
  vehicleRequirement: number | null;
  typeOfGoods: string | null;
  designation: string | null;
  foundOn: string;
  remarks: string | null;
};

type Field = keyof InboundLead | "firstName" | "lastName";

/** Every name a field is accepted under, already normalised. */
const ALIASES: Record<Field, string[]> = {
  companyName: ["company", "companyname", "company_name", "organization", "organisation", "business", "businessname", "firm"],
  callerName: ["name", "fullname", "full_name", "contactname", "callername", "yourname", "customername"],
  firstName: ["firstname", "first_name", "fname"],
  lastName: ["lastname", "last_name", "lname", "surname"],
  mobile: ["phone", "mobile", "phonenumber", "mobilenumber", "mobileno", "phoneno", "contactnumber", "contactno", "whatsapp", "whatsappnumber", "tel", "telephone"],
  email: ["email", "emailaddress", "emailid", "mail"],
  callingCity: ["city", "location", "callingcity", "town"],
  vehicleType: ["vehicletype", "vehicle", "vehiclecategory"],
  vehicleRequirement: ["vehicles", "vehiclecount", "numberofvehicles", "noofvehicles", "vehiclerequirement", "fleetsize", "fleet", "quantity", "qty"],
  typeOfGoods: ["goods", "typeofgoods", "goodstype", "cargo", "industry", "product"],
  designation: ["designation", "title", "jobtitle", "role", "position"],
  foundOn: ["source", "foundon", "howdidyouhear", "howdidyouhearaboutus", "referral", "utmsource", "leadsource"],
  remarks: ["message", "notes", "note", "comments", "comment", "remarks", "requirement", "requirements", "query", "enquiry", "inquiry", "details", "conversation", "transcript", "summary"],
  enquiryDate: ["enquirydate", "inquirydate", "date", "createdat", "submittedat", "timestamp"],
};

/** Same cut-offs as the Leads form, so a website lead edits like any other. */
const MAX: Partial<Record<Field, number>> = {
  companyName: 200,
  callerName: 160,
  firstName: 80,
  lastName: 80,
  mobile: 40,
  email: 200,
  callingCity: 120,
  vehicleType: 120,
  typeOfGoods: 200,
  designation: 160,
  foundOn: 160,
  remarks: 2000,
};

const normalise = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The lead's fields out of a posted body.
 *
 * Accepts the fields at the top level, or wrapped one level down under
 * "lead", "data", "contact", "fields" or "payload" — the shapes Zapier, Make
 * and most chatbot webhooks use.
 */
function flatten(raw: Record<string, unknown>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const take = (obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = normalise(k);
      if (!out.has(key) && v !== null && v !== undefined && typeof v !== "object") {
        out.set(key, v);
      }
    }
  };
  take(raw);
  for (const wrapper of ["lead", "data", "contact", "fields", "payload"]) {
    const inner = raw[wrapper];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      take(inner as Record<string, unknown>);
    }
  }
  return out;
}

function text(values: Map<string, unknown>, field: Field): string | null {
  for (const name of ALIASES[field]) {
    const v = values.get(normalise(name));
    if (v === undefined) continue;
    const s = String(v).replace(/\s+/g, " ").trim();
    if (!s) continue;
    const max = MAX[field];
    return max ? s.slice(0, max) : s;
  }
  return null;
}

/** "5", "5 trucks", "about 12" → the first whole number; nonsense → null. */
function count(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/\d[\d,]*/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : null;
}

/** A posted date as YYYY-MM-DD, if it is a real day no later than today. */
function day(value: string | null, today: string): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const parsed = iso ? new Date(`${iso}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  // 2026-02-31 parses as 3 March; a date that does not round-trip is not one.
  if (parsed.toISOString().slice(0, 10) !== iso) return null;
  return iso! <= today ? iso! : null;
}

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function parseInboundLead(
  raw: Record<string, unknown>,
  today: string,
): { ok: true; lead: InboundLead } | { ok: false; error: string } {
  const values = flatten(raw);

  const mobile = text(values, "mobile");
  const rawEmail = text(values, "email");
  const email = rawEmail && looksLikeEmail(rawEmail) ? rawEmail.toLowerCase() : null;
  if (!mobile && !email) {
    return {
      ok: false,
      error: "A lead needs a phone number or an email address, so somebody can call back.",
    };
  }

  const first = text(values, "firstName");
  const last = text(values, "lastName");
  const callerName =
    text(values, "callerName") ?? ([first, last].filter(Boolean).join(" ") || null);

  // The Leads table requires a company. A chatbot often never asks for one,
  // so the person's name stands in — the desk corrects it after the call.
  const companyName =
    text(values, "companyName") ?? callerName ?? email ?? "Website visitor";

  return {
    ok: true,
    lead: {
      enquiryDate: day(text(values, "enquiryDate"), today) ?? today,
      companyName,
      callerName,
      mobile,
      email,
      callingCity: text(values, "callingCity"),
      vehicleType: text(values, "vehicleType"),
      vehicleRequirement: count(text(values, "vehicleRequirement")),
      typeOfGoods: text(values, "typeOfGoods"),
      designation: text(values, "designation"),
      foundOn: text(values, "foundOn") ?? "Website chatbot",
      remarks: text(values, "remarks"),
    },
  };
}

/**
 * The key a request carries: `Authorization: Bearer <key>`, an `X-API-Key`
 * header, or `?key=` on the URL for tools that can only be given an address.
 */
export function keyFromRequest(headers: Headers, url: URL): string | null {
  const auth = headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const key = bearer || headers.get("x-api-key")?.trim() || url.searchParams.get("key")?.trim();
  return key || null;
}

/** Keys this app issues: "gdl_" and 40 URL-safe characters. */
export const KEY_PREFIX = "gdl_";
