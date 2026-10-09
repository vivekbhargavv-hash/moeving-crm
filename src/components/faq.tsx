import { ChevronDown } from "lucide-react";

import type { UserRole } from "@/server/auth";

/**
 * How the CRM behaves, in the words a new joiner would ask it.
 *
 * Every answer describes what the app actually does — change the behaviour,
 * change the answer here. Each person sees the questions for the screens they
 * can reach, so the desk is not taught the cost sheet and ops is not taught
 * leads. Plain <details>: no JavaScript, and it opens with a tap anywhere.
 */
type Item = { q: string; a: React.ReactNode; for: UserRole[] };

const ALL: UserRole[] = ["admin", "sales", "ops", "noc"];
const SELLERS: UserRole[] = ["admin", "sales"];
const LEADS: UserRole[] = ["admin", "sales", "noc"];
const DEPLOY: UserRole[] = ["admin", "sales", "ops"];

const ITEMS: Item[] = [
  {
    q: "Who sees what?",
    for: ALL,
    a: (
      <>
        <b>Admins</b> see everything. <b>Deal Owners</b> see Leads, Pipeline,
        Customers, Dashboard, Forecast and Deployments. <b>Operations</b> see Deployments
        only — never a price or a margin. The <b>phone desk (NOC)</b> sees
        Leads only.
      </>
    ),
  },
  {
    q: "How does an enquiry become a deal?",
    for: LEADS,
    a: (
      <>
        The phone desk writes the enquiry down as a lead. An admin assigns it
        to a Deal Owner — or a Deal Owner picks up a lead with no owner simply
        by acting on it. The Deal Owner calls, then marks it{" "}
        <b>Qualified</b> or <b>Not qualified</b> with a one-line remark. A
        qualified lead becomes a deal with <b>Save &amp; convert</b>, or later
        with <b>Convert</b> on its card.
      </>
    ),
  },
  {
    q: "What do the colours on a lead mean?",
    for: LEADS,
    a: (
      <>
        The left edge is the outcome: <b>amber</b> — nobody has called yet;{" "}
        <b>green</b> — qualified, or already a deal; <b>red</b> — not
        qualified. A <b>rose outline</b> means the lead is assigned to you and
        you have not called yet, and the red number on the Leads tab counts
        those.
      </>
    ),
  },
  {
    q: "Why can't I qualify or convert a lead?",
    for: SELLERS,
    a: (
      <>
        It is assigned to another Deal Owner. An assigned lead is only its
        owner&apos;s (and the admins&apos;) to act on. Ask an admin to reassign
        it if it should be yours.
      </>
    ),
  },
  {
    q: "How do I get notified about new leads?",
    for: SELLERS,
    a: (
      <>
        Tap <b>Enable notifications</b> above, once on each phone or computer.
        You are then notified the moment a lead is assigned to you, with a{" "}
        <b>Call</b> button on Android. On an iPhone, add the app to your Home
        Screen first and turn notifications on from there — Safari itself
        cannot show them.
      </>
    ),
  },
  {
    q: "What do the deal stages mean?",
    for: SELLERS,
    a: (
      <>
        First Contact → Solutioning → Proposal → Negotiation →{" "}
        <b>Contracting</b> (verbally agreed, paperwork in flight) →{" "}
        <b>Closed Won</b>. <b>Closed Lost</b> asks for a reason.{" "}
        <b>Dormant</b> parks a deal that has gone quiet without losing it.
      </>
    ),
  },
  {
    q: "Why is every price per vehicle per month?",
    for: SELLERS,
    a: (
      <>
        It is how the business compares deals: what one truck earns and costs
        in a month. The deal&apos;s monthly value is that price × the fleet
        size, and it updates by itself when the fleet changes.
      </>
    ),
  },
  {
    q: "What do I need before marking a deal Closed Won?",
    for: SELLERS,
    a: (
      <>
        The price, all seven cost lines (lease, driver, charging, parking,
        maintenance, supervisor, miscellaneous) and the expected deployment
        date. You can fill the cost sheet on the deal&apos;s page at any stage,
        and give the deployment date at Contracting — the Closed Won step then
        only asks for what is still missing.
      </>
    ),
  },
  {
    q: "How is the deal name set?",
    for: SELLERS,
    a: (
      <>
        It fills itself in as <b>Customer - City</b> while you type and pick.
        Change it if you like; once you do, it stays yours. Pick several
        cities and you get one deal per city, each with its city in the name.
      </>
    ),
  },
  {
    q: "Duplicate, or Deploy more vehicles?",
    for: SELLERS,
    a: (
      <>
        <b>Duplicate this deal</b> starts a new deal at First Contact with the
        same customer, vehicle and terms — for another city or another phase.
        Costs are not copied. <b>Deploy more vehicles</b>, on a won deal, is
        repeat business under the same contract: it is linked to that win and
        counts as won on the day you raise it.
      </>
    ),
  },
  {
    q: "What does the Sales Closure Forecast show?",
    for: SELLERS,
    a: (
      <>
        Every open deal, by city and the month its owner expects it to close.
        An open deal whose closing month has already passed sits in the red{" "}
        <b>Overdue</b> column until its date or stage is updated. A new deal
        cannot be saved without an expected closing month; older deals with
        none are in no column, and the note under the grid counts them. <b>Wins</b> count on the day a deal is marked won, not
        its expected month.
      </>
    ),
  },
  {
    q: "What shows on Deployments?",
    for: DEPLOY,
    a: (
      <>
        Deals in <b>Contracting</b> or <b>Closed Won</b> that have an expected
        deployment date. Contracting ones are badged <b>Expected</b>: plan for
        them, but vehicles can only be recorded once the deal is won. Record
        vehicles as they go out — part of a fleet is fine (&ldquo;8 of
        12&rdquo;). <b>By month</b> counts only vehicles still to go out; a
        deal with every vehicle on the road moves to <b>Deployed</b> under the
        grid.
      </>
    ),
  },
  {
    q: "Where do signed agreements go?",
    for: SELLERS,
    a: (
      <>
        On the customer&apos;s page (<b>Customers</b> in the menu, or tap the
        customer&apos;s name on a deal). Upload a PDF, a photo or a Word file
        and say whether it is an <b>MSA</b>, an <b>Addendum</b> or{" "}
        <b>Other</b>, when it was signed and when it renews — both dates are
        required; an addendum takes the renewal date of what it amends. Leave{" "}
        <b>Covers</b> on <i>All deals</i> for a master agreement, or pick the
        one deal it is for. A won deal with nothing covering it shows{" "}
        <b>No agreement</b> in the Pipeline — a reminder, not a block. Any
        Deal Owner can upload, edit or delete one; Operations and the phone
        desk cannot see them.
      </>
    ),
  },
  {
    q: "How do renewal reminders work?",
    for: SELLERS,
    a: (
      <>
        Every agreement appears under <b>Renewals due</b> at the top of
        Customers from 60 days before its renewal date, and turns red once it
        has passed. Uploading the renewed agreement with a later renewal date
        clears it, as does moving the date forward with Edit. Papers for the
        same customer renewing on the same day show as one reminder.
      </>
    ),
  },
  {
    q: "Can a customer be deleted?",
    for: ["admin"],
    a: (
      <>
        Only by an admin, and only a customer with no deals and no
        agreements — a misspelt name, say. On Customers, tap the note that
        counts customers with no deals, then the bin on the row (or use{" "}
        <b>Delete this customer</b> on its page). A customer with any deal,
        open or closed, stays: it is how that history is found.
      </>
    ),
  },
  {
    q: "Can I delete a deal?",
    for: SELLERS,
    a: (
      <>
        A Deal Owner can delete their own open deals. Only an admin can delete
        a won deal, because it is already in the reported wins. A deal that
        came from a lead hands the lead back to the Leads page as Qualified.
      </>
    ),
  },
];

export function Faq({ role }: { role: UserRole }) {
  const items = ITEMS.filter((i) => i.for.includes(role));
  return (
    <div className="divide-y divide-line">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 py-3 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
            <span className="flex-1">{item.q}</span>
            <ChevronDown
              size={17}
              className="shrink-0 text-muted transition group-open:rotate-180"
            />
          </summary>
          <p className="pb-4 text-[14px] leading-relaxed text-muted [&_b]:font-semibold [&_b]:text-ink">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
