# Good Deal — Session Handoff

**Last updated:** 23 September 2026 (ninth session, lead assignment)
**Owner:** Vivek (product owner, not a programmer — explain in plain English)
**Repo:** `vivekbhargavv-hash/moeving-crm`, branch `main` (push straight to it)
**Live:** https://good-deal-crm.vercel.app

Read this, then `README.md` for setup mechanics.

---

## 0. START HERE — the things waiting on a human

**Migrations 0000–0012 are all applied to production** (0012, lead
assignment, on 23 Sep before its code deployed). Migrations are applied by
hand through the Neon MCP connector BEFORE their code deploys, because the app
queries those tables on page load — 0012 is read by the shell on EVERY page,
for the Leads badge.

### Push notifications (23 Sep)

0. **The three Web Push keys are set in Vercel** (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) and production was redeployed with
   them. **Never regenerate the pair** once people have turned notifications
   on (see § 7). Still unproven on a real phone: the first test is an admin
   assigning a lead to someone who pressed Settings → Enable notifications.

### Blocking somebody today

1. **Clerk Organizations is switched on, and it traps invited users.** After
   setting a password, a new joiner lands on Clerk's own "Setup your
   organization" screen and cannot get past it: Clerk matches the verified
   `moeving.com` domain, finds an organization already exists, and says "join
   by invitation" — an invitation this app never sends. **This app does not use
   Clerk organizations at all** (`requireSession()` reads only `userId`; the
   organization comes from our own tables), so the fix is to turn the
   requirement off: Clerk Dashboard → Organizations → Settings → membership
   **optional** (or disable Organizations entirely). One toggle, no deploy.
2. **Fill in the blank cost defaults, then press "Fill in the blanks".**
   Admin → Cost defaults is seeded with what was known on 22 Sep: Maintenance
   2000, Supervisor 2000, Miscellaneous 0, Charging 5000 (1T Tata Ace) and 7000
   (1.7T Eicher) when MoEVing pays, 0 for every vehicle when the client pays.
   **Lease, Driver, Parking and charging for Switch iev4 / Ultra E7 / Ultra E9
   are deliberately blank** — nobody gave those figures, and a blank means the
   cost sheet leaves that line alone rather than inventing one.

   The screen now has a **Save changes** button (it used to save each box on
   blur, silently), and under the grids a **Fill in the blanks** button that
   carries the rates onto deals already in the pipeline. Setting a rate does
   nothing to an existing deal on its own — it pre-fills the cost sheet the
   next time somebody opens one — so without that button a pipeline raised
   before the rates existed shows no cost and no margin. It fills blanks only:
   a typed figure is never touched, and a won deal cannot have a blank.
3. **Give the phone desk the NOC role.** Admin → Users → role **NOC**. They see
   Leads and nothing else. Until somebody has it, leads can only be added by an
   admin.

8. **A throwaway Neon branch `delete-fix-verify` exists.** It was a copy of
   production used to prove the delete fix against the real schema without
   touching live data. It costs storage and nothing reads it — delete it in
   the Neon console, or ask and it will be removed.

### Still open from earlier sessions

4. **Rotate the Clerk secret key.** `sk_live_…` was pasted into a chat
   transcript. Clerk → API Keys → regenerate. A live secret can read and
   modify the entire user store. (Unverified — do it if it has not been done.)
5. **The GitHub repo is public.** Settings → General → Change visibility →
   Private. Nothing secret is committed (`.env.local` is gitignored), but the
   schema and pipeline logic are readable by anyone.
6. **Neon scale-to-zero cannot be changed on this plan.** The compute suspends
   after ~5 minutes idle, so the first screen after a pause waits for the
   database to wake. The API refuses the change — *"modifying the suspend
   interval is not permitted on this account"* — so it needs a Neon plan
   upgrade, after which it is a one-line change.
7. **The production database holds live data.** Deals, 26 imported leads, and
   the master data. `drizzle/demo-data.sql` is still in the repo: running it now
   would put fake deals into live data.

---

## 1. What this is

A mobile-first sales CRM for MoEVing's EV logistics team, built because vTiger
has everything and gets used by nobody. Five screens, large touch targets, a
deal you can move in two taps from a phone.

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Neon Postgres · Drizzle ·
Clerk · installable PWA · Vercel.

**Screens:** Dashboard · Leads (the inbound desk) · Pipeline (board + list) ·
Forecast (forecast + wins) · Deal detail · Quick Add · Deployments (the ops
queue) · Settings (install) · Admin (users, master data, cost defaults).

---

## 2. The decisions that shape everything

Change these only deliberately — a lot of code assumes them.

| Decision | Why |
|---|---|
| **Every money column is per vehicle per month.** `price` is one truck's rent; the Closed Won cost sheet is one truck's running cost. | It is how the business thinks ("what does a truck earn"). Deal-level figures are generated as `× fleet_size`, so changing the fleet rescales the deal instead of leaving stale totals. |
| **Money is whole rupees in `integer` columns.** | No paise, no floats, no numeric-as-string round trips. |
| **Margin maths live in Postgres** as generated columns (`cost_per_vehicle`, `margin_per_vehicle`, `total_revenue`, `total_cost`, `gross_margin`, `margin_pct`). | No two screens can disagree. |
| **Two check constraints enforce the workflow.** `closed_won` requires revenue + all seven costs; `closed_lost` requires a reason. | No code path, present or future, can write a half-closed deal. |
| **`organization_id` on every table; `requireSession()` is the only place it is produced**, always from the Clerk session — never a form field, query string or header. | Multi-tenant from day one. Adding a second organization is a row, not a migration. |
| **Wins count on `closed_at`**, not `expected_close_date`. | The expected date is a forecast and usually wrong by the time a deal lands. The Dashboard's period switch (all time / this FY / quarter / 90 days) narrows won and lost deals by `closed_at` too; the open pipeline is never narrowed. |
| **Dates and times are India's**, via `todayInIndia()` and `formatDateTimeInIndia()` in `lib/utils.ts`. | The server renders in UTC. Anything that formats a moment or asks for "today" without `Asia/Kolkata` is 5½ hours out — activity times read wrong, and before 05:30 "today" was yesterday. |
| **A screen with a phone and a desktop layout renders only one**, chosen by `useIsDesktop()` (`lib/use-desktop.ts`) with the server's user-agent guess (`server/device.ts`) as the first value. | Rendering both and hiding one with CSS meant a phone built the whole desktop board and table it never showed. The Pipeline does this; other screens still use CSS hiding and are candidates. |
| **Sheets render at the end of `<body>`** (`createPortal` in `Sheet`). | A Picker lives inside a `Field`, which is a `<label>`. Rendered in there, choosing an option closed the sheet and the label then "clicked" the picker's trigger, reopening the list — on every choice, in production. Keep it portalled. |
| **Confirm a save with `showToast()`** (`lib/toast.ts`); the shell owns the one toast. | A sheet that closes and says nothing reads as a tap that missed. |
| **A required `Picker` validates in the browser.** Its value posts from a visually hidden text input, not `type="hidden"`. | Browsers skip hidden and read-only inputs when validating, so `required` there never stopped a form. |
| **The deal page's back link goes back through history** when the previous page is in the app (`BackLink`, `lib/nav-history.ts`). | A fresh link to `/pipeline` lost the search and filters, and was wrong from Leads, Forecast or Deployments. |
| **After a server action that calls `revalidatePath`, do not also call `router.refresh()`.** | The action's response already carries the re-rendered page; a refresh on top renders and fetches it a second time. The admin screens and the delete path still have one — harmless, just slower. |
| **Everyone's Pipeline opens on their own deals, admins included**, with a My deals / All deals toggle in plain sight. | Your own deals are what you came to look at. It is a default view, not a permission — the whole team is one tap away and never hidden. |
| **`deployment_date` is not `expected_close_date`.** It is asked for on the Closed Won sheet and enforced by `opps_won_requires_deployment_date`. | The expected close date is a sales forecast made months earlier about a different question. Ops cannot plan trucks against it, and reusing the field would have let a sales edit silently move an ops commitment. |
| **The Closed Won sheet asks for a DAY, not a month.** A full `date`, validated as a real calendar day (`2026-02-31` is refused, not rolled over to 3 March). | Ops schedules drivers and charging against a date. Storing a month as its last day made every deal in a month look due on the 30th — wrong, and for most of them late. Rows won before 21 Sep 2026 still carry month-end dates; nothing migrates them, because nobody now knows what day was meant. |
| **The Deployments queue opens By date and toggles to By city**, remembered per person in `localStorage`. | Overdue-and-next is the question someone opens the screen with; a hub loading trucks asks the other one. The grouping maths live in `lib/deployment-groups.ts`, free of React, so the boundaries are tested. |
| **Deployment progress is a count (`vehicles_deployed`), not a flag.** | Ops routinely sends part of a fleet first. A boolean would force somebody to choose between lying and waiting, so "8 of 12 out" is the state. |
| **Three roles: admin, sales, ops.** Ops sees Deployments and Settings, nothing else. | They put trucks on the road; they have no business seeing what a customer pays. `requireSales()` refuses at each page, and `listDeployments()` selects no money column at all, so a slip in the page cannot leak one. |
| **The Pipeline opens on the table, sorted by most recently updated.** | What moved since you last looked is the reason to open the screen. The board is one tap away and the choice is remembered per person. |
| **Repeat business is a NEW deal linked to the won one** (`parent_opportunity_id`), never an edit to the won row. | A won deal that grows would move a recorded win out of the month it happened in and silently restate Wins-by-month. |
| **An expansion asks only city, fleet and deployment date.** Everything else is copied off the parent BY THE SERVER, not by the form. | The unit economics came with that contract. Copying server-side means the lock is real: posting `price` or `stage` into that action changes nothing. |
| **An expansion lands as `closed_won` dated TODAY**: `closed_at` and `expected_close_date` are the day it was raised, `deployment_date` is the day the trucks are due. | Nothing is being sold, so it is not a pipeline stage. The two dates are separate on purpose: reporting counts the expansion when it was agreed, so a delivery that slips cannot restate a month that has already been reported, while ops still plans against the real date. Its cost sheet is the parent's, so margin_pct and total_cost compute themselves. |
| **Deleting a `closed_won` deal is admin-only**; anything open is the owner's to delete. | A win is a month in the wins report and a slice of reported margin. Deleting one restates both. |
| **Suspending, not deleting, is how someone leaves.** `owner_user_id` is `ON DELETE RESTRICT`. | Their name is part of the history of every deal they closed. Delete is offered only for a row that owns nothing — a wrong address typed in. |
| **Auth checks sit next to the data**, not in middleware path matching. | Clerk deprecated `createRouteMatcher` for exactly this reason: path matching drifts from how Next routes requests. |
| **One `Segmented` control in `components/ui`, used by every view switch.** | There were five built by hand in three treatments — and the Admin one had no active state at all, so both tabs looked identical and the screen never said which page you were on. |
| **Colour means a state, never decoration.** Stage chips run a cool ramp while a deal is open (slate → sky → blue → indigo → violet), emerald won, rose lost, slate dormant; Dashboard tiles are white unless the number is money banked (green) or actually bad (rose). | Six tinted tiles in five hues made every number shout equally, and Negotiation — the healthiest an open deal gets — was painted the amber every other screen uses for "late". |
| **There is no native `<select>` in the app.** Every choice is `Picker` (or `PickerField` for an uncontrolled one), which opens the app's own sheet; it posts through a hidden input, so a form sees exactly what a select gave it. | A native select hands the choosing to the OS — on Android a grey system dialog in the middle of a screen that looks nothing like it — and sizes itself to its longest option, which is what once pushed a control row past the edge of the screen. `Sheet` ref-counts its scroll lock so a picker inside a sheet is safe. |
| **`users.last_seen_at` says who is actually using the CRM.** Written by `requireSession()`, throttled to once every few minutes per person (`lib/last-seen.ts`); null means never signed in, which Admin shows as "Invited". | The amber "Invited" badge vanished on first sign-in and left nothing, so a person who signed in once in March looked identical to one who was in this morning. It is deliberately not backfilled: `created_at` is when an admin typed someone's address, not a moment they were ever here. |
| **A picked date is echoed in words** under every `input[type=date]` (`PickedDate`). | The native picker uses the BROWSER's language, not the page's, so the same field reads dd/mm/yyyy on one phone and mm/dd/yyyy on the next and 05/09 means two different days. Nothing in the app can change that, so it says the date in words instead. |
| **A screen never loads more than it can show.** Pipeline filters, owner scope and SEARCH are all a WHERE clause (URL-driven, `?scope=&stage=&city=&vehicle=&owner=&q=`), capped at 250 rows; long lists render a window with "Show more". | It used to select every deal the organization had ever had and hide the rest in the browser: 1,476 deals was 1 MB of HTML on a phone to show the thirty that were yours. Search is in SQL specifically so the cap can never hide a deal from the feature whose job is to find one. |
| **The Deployments query keeps all outstanding work plus 90 days of finished work**, not every deployment ever made. | Outstanding is bounded by what is owed; history is bounded by nothing at all, and all of it was being sent to a phone, oldest first. |
| **Vercel functions are pinned to `sin1`** in `vercel.json`. | Neon is in `ap-southeast-1`. They were in Washington DC; every query crossed the Pacific twice. |
| **`price` and `revenue` are the same figure.** The deal's price per vehicle IS its revenue per vehicle; `revenue` is written from `price` and never asked for separately. The Closed Won sheet asks for the price and writes it back. | They were one number asked twice, free to disagree, and nobody could say which was right. Editing the price of a won deal now carries revenue and margin with it, and posts a before/after note to the deal's timeline — that restates a month already reported, so it is never silent. |
| **Unit economics can be filled in at ANY stage; Closed Won is where they are mandated.** A partly costed open deal is fine; the move into `closed_won` still needs all eight figures, and now counts anything costed earlier. | Pricing is worked out while quoting. Asking for the whole cost sheet at the moment of winning put it on the one screen where somebody is busiest and least able to go and ask. |
| **`operating_days` (26 or 30) is recorded, never multiplied.** `price` is the monthly rate under either. | The same monthly rent is a different day rate at 26 days than at 30, and that is the first thing anyone asks comparing two deals. Making it arithmetic would have changed the meaning of every existing deal's value. |
| **Each cost line declares what it varies by** (`COST_FIELDS[].dimensions`), and Admin → Cost defaults builds its grids from that same declaration. | A table where "the most specific matching row wins" cannot settle charging: a rule about a Tata Ace and a rule about client-paid charging are equally specific and disagree. With dimensions fixed per line, charging is a vehicle × scope grid where "Ace, client pays" is its own row worth 0. |
| **A blank default is not a zero.** Blank means nobody has said, and the cost sheet leaves that line alone; 0 means the business says it is free. | Client-paid charging genuinely is 0. If blank meant 0, every unset line would quietly claim a cost of nothing. |
| **Defaults fill blanks and never overwrite a typed figure.** When a deal's vehicle or contract changes later, saved figures stay saved and the card notes which now differ from the standard rate. | A rule is where to start, not an opinion about a deal somebody has already costed — least of all a won one, whose margin has been reported. |
| **Leads are their own table, not a pipeline stage.** Inbound enquiries live in `leads`; a qualified one is converted into a deal, which links back. | Most enquiries never become deals, and a pipeline that fills with unqualified calls stops being a forecast. |
| **Four roles: admin, sales, ops, noc.** NOC writes leads down and sees nothing else. Ops sees Deployments and nothing else — deliberately including leads, which carry a caller's name, mobile and email. | Each desk sees the screen it works and no more. `requireLeads()`, `requireDealOwner()` and `requireDeployments()` sit next to the data, like every other guard. |
| **Every lead action takes a remark; saying no takes a reason.** Both are check constraints. `converted` is never typed — the app sets it when the deal exists. | A status with no sentence behind it tells the next person nothing, and a word that can get ahead of the fact it describes will. |
| **Converting a lead asks for the city and vehicle type.** The enquiry says "3W" and a typed city; a deal needs a real model and a city from the master list. | A deal raised against the wrong vehicle is worse than one more question. The caller's details travel into the deal's notes, because a deal has nowhere else to hold a phone number. |
| **Every screen has a `loading.tsx`.** | Every page is `force-dynamic`, so a tap used to leave you on the page you were leaving, frozen, until the whole next page came back. A loading boundary also lets Next prefetch the shape of the next screen. |
| **Filters draft locally and apply once.** The pipeline's filter sheet keeps a draft; the button says what it will do. | Filters live in the URL, so each chip was its own navigation: a stage, two cities and an owner cost four server renders in a row. |
| **`revenue` is written from `price` at creation**, not only when the price is later edited. | Quick Add wrote the price and left revenue null, and every margin column in Postgres is generated from `revenue` — so a brand-new deal had `total_revenue` 0 and `margin_pct` null however carefully it was costed. The Pipeline's Total cost and Margin % columns stayed empty until somebody happened to edit the price, which was the one edit that carried revenue with it. |
| **One `Segmented` treatment at every width**: a bordered white shell, the chosen option filled in ink. | The phone used to get a grey track with a white card on it, which does not read as a control — a grey strip with two words above white cards looks like a caption you cannot press. Vivek's words: "they don't appear as toggle buttons in mobile view". |
| **The phone's bottom bar carries four tabs** — Leads, Pipeline, Deploy, Add deal — and a hamburger in the header opens every page. | Six tabs plus the Add-deal button gave each one 56px on a 390px screen. Dashboard and Forecast are screens you sit down to look at; the other three are in and out of all day. |
| **A lead keeps three timestamps: `created_at`, `actioned_at`, `converted_at`.** Converting no longer overwrites `actioned_at`. | The three are the funnel — how fast the desk rings back, and how many of those calls become business. Conversion used to stamp `actioned_at` with the moment of conversion, which erased the one number the desk is actually measured on. |
| **Inbound conversion is measured out of ENQUIRIES, never out of the previous step**, and the headline rate is WON, not converted. | A rate measured against the step before it flatters itself: a desk that rang two leads and converted both would report 100%. And raising a deal costs nothing — the enquiry only paid for itself when the trucks were sold. `lib/lead-funnel.ts`, free of React, so the denominators are tested. |
| **The expected deployment date is offered at Contracting and mandated at Closed Won.** A date given at Contracting satisfies the Won sheet. | Contracting means verbally agreed with paperwork in flight — the first moment anybody can honestly say when the trucks are wanted, and weeks before the win. It is the same rule the cost sheet already follows: the answer must EXIST by Closed Won, not be typed at that moment. Optional at Contracting on purpose; a deal owner who does not know yet must not be blocked from moving the stage. |
| **A Contracting deal with a date appears in Deployments, badged "Expected", and counts in the totals.** Recording vehicles against one is refused. | Vivek's call, over the alternative of a separate uncounted section: ops wants the forward view in the numbers they plan against. The guard that matters is still real — `recordDeployment()` checks the stage, so nothing can be marked deployed against an unsigned deal. The risk he accepted: "To deploy" includes work that is not yet owed. |
| **No server code may call `db.transaction()`.** `tests/neon-http-driver.test.ts` fails the build if any does. | Production runs Neon over HTTP, which has NO transaction support — the call throws the moment it is reached. A local Postgres uses node-postgres, where it works perfectly. So a transaction passes every test on a developer's machine and throws for every real user, which is exactly what happened: the delete fix shipped, and the screen went on saying "check your connection". |
| **The Pipeline is per vehicle per month, end to end** — price, cost and margin. Monthly value and whole-fleet cost appear only on a deal's own page. | One deal is comparable with another on what a truck earns and costs, not on the size of its fleet. Printing the deal-level figures beside them puts two sizes of the same number on one row, an order of magnitude apart, and invites the misreading. The deal page has the room to show both. |
| **Deleting a deal hands its lead back to the desk** as `qualified`, with a remark saying where the deal went. | `leads.opportunity_id` is ON DELETE SET NULL and `leads_converted_requires_opportunity` forbids a converted lead holding a null one, so the cascade fought the check and Postgres refused the delete outright. The lead itself is never deleted: somebody rang that company, and the enquiry happened whatever became of the deal. |
| **The Pipeline's headline money column is `price` — per vehicle, per month.** Deal value steps behind the `2xl` breakpoint. | It is how the business thinks about a deal ("what does a truck earn"), and it is the figure every cost line on the sheet is comparable with. Value is that times the fleet and both halves are on the same row. |
| **Deployments has a third view, By month**: city in rows, month in columns, vehicles in the cells, tapping a city for the clients behind the number. | By date answers "what is late", By city answers "what does Bangalore owe". Neither answers "how many trucks land where, and when", which is a shape rather than a list. The arithmetic is `lib/deployment-grid.ts`, free of React, so it tests. |
| **The Deployments grid's detail panel sits UNDER the table**, not inside a row of it. | The Forecast tucks its drill-down into a table cell held to the viewport width by hand. Here the client rows landed beneath the fade that hints at sideways scroll: legible, and looking cut off. Below the table they get the full page width and no hack. |
| **Leads have an owner** (`assigned_to_user_id`). Only an admin assigns; an assigned lead is its assignee's and the admins' alone to qualify, reject or convert. There is NO Take button: a deal owner who qualifies or rejects an unowned lead has taken it; an admin doing so has not. | Vivek's rules, 23 Sep. `lib/lead-assignment.ts` holds them free of React, and both the actions and the cards call it, so the screen cannot offer what the server refuses. |
| **"Waiting on me" = assigned to me AND status `new`.** It drives a red count on the Leads tab (rail, phone bar, menu) and a rose ring on the card. | A qualified lead waiting to be converted is not a phone call somebody owes. The count is one indexed query in `(app)/layout.tsx` — the one exception to "the shell fetches nothing" — so it is fresh on every navigation, not live on an open page. |
| **An assignment pushes a notification to the assignee's devices**, never email: title "New lead: ZYRKON · Hyderabad · 2 × 3W", body the caller and number, and a **Call** button when there is a number. Web Push with VAPID keys; one `push_subscriptions` row per browser; a 404/410 deletes the row. Best effort — never fails the assignment. | Vivek: in-app plus push, no email. Assigning to yourself sends nothing. A notification cannot dial by itself (a service worker cannot open `tel:`), so Call opens `/leads?lead=<id>&call=1`: the page scrolls to the card, rings it green, and hands the number to the dialer; where a browser refuses to dial without a tap, the card's Call button is under the thumb. A plain tap opens `/leads?lead=<id>`. iOS shows no notification buttons at all. |
| **The Leads screen per desk.** Deal owner: **My leads** (default) = "Assigned to you", then "No owner yet" — never a colleague's — and **All**; the funnel sits BELOW the list. Admin: **Open · No owner · All**, funnel on top, an Owner picker on each open card. NOC: **Open · All**. A search looks through every lead whatever the view. | Vivek: "My leads first and unassigned after that". A deal owner opens the screen to ring people; four tiles of conversion rates in front of the list pushed their first lead below the fold on a phone. |
| **One row of buttons per card, next step first**: new → Call · Qualified · Not qualified; qualified → Convert · Call · Not qualified. **Call appears on touch devices only** (`pointer-coarse`, not a width breakpoint), and the notification's Call action only on a phone (`userAgentData.mobile` in the service worker) — Vivek: a Call button is useless on a desktop. The number stays a tel: link everywhere. Qualified offers **Save & convert**. Not qualified offers one-tap reasons (Budget, Wrong vehicle type, City we don't serve, Already has a vendor, Not reachable, Just enquiring) with typing still open. | Fewest taps from notification to outcome: Call → talk → Qualified → Save & convert. The sheet no longer pre-fills the DESK's note as the deal owner's remark (a quick Save used to record the desk's words as theirs); the desk note is shown above the box instead. "Add a remark" on a qualified card is gone — Qualified/Not qualified reopen the sheet with the remark in it. |
| **Notifications are opt-in by a tap** — a dismissable prompt on Leads (deal owners and admins) and an **Enable notifications** button in Settings → Notifications. | Browsers refuse a permission prompt nobody asked for, and a prompt on page load teaches people to press Block, after which only browser settings can undo it. |
| **Suspending someone returns their open leads to the pool.** | While a lead is theirs nobody else may act on it, and a suspended person rings nobody. |
| **The Deployments grid spans the data's own months with no gaps.** | A fixed window hides a delivery that slipped past its end; dropping empty months prints "Sep, Nov, Jan", which reads as a stride rather than a calendar. The blank October column is itself the answer to "what does October look like". |
| **A lead card says loudly what a deal owner did with it**: a coloured left edge (amber waiting, green qualified or a deal, red not qualified) and, once somebody has acted, a green or red panel naming who, when, the reason and the remark. An unactioned lead gets the amber edge and NO panel (Vivek: the sentence on every waiting card was noise) — only the desk's note, if any, in plain grey. The calling city sits on its own line under the company, bold with a pin. | The NOC desk cannot see the pipeline, so this is the only way it learns whether anybody rang back. A lead has one `remarks` column: before a deal owner acts it is the desk's note, after it is theirs, so the label follows `actioned_by`, not the status. |
| **The desktop rail ends with a Pricing Tool link** (https://moeving-pricing.vercel.app/, new tab) for admin and deal owners, not ops or NOC. | Deal owners quote from that calculator; it is a separate app, so it is a link, not a screen. |

---

## 3. Layout

```
src/
  app/
    (app)/            dashboard · leads · pipeline · forecast · opportunities/[id]
                      deployments (ops, sales, admin) · settings (everyone)
                      admin/users · admin/master-data · admin/cost-defaults
                      every route has a loading.tsx beside its page.tsx
    api/export/deals  CSV export (org-scoped, UTF-8 BOM for Excel)
    sign-in, sign-up, no-access, offline
  components/
    app-shell.tsx     mobile header + tab bar + desktop rail + toast
    quick-add.tsx     the 30-second create sheet
    stage-changer.tsx stage picker + Closed Won cost sheet + Closed Lost reason
    leads/funnel.tsx  inbound conversion, by period
    leads/board.tsx   the inbound desk: list, new-lead form, qualify /
                      not-qualify sheets, the convert-to-deal sheet, and the
                      owner row (admin picker / "Assigned to")
    enable-notifications.tsx  the push opt-in: compact on Leads, full in Settings
    pipeline/         board.tsx (kanban) · table.tsx (list + table) · filters.tsx
    forecast/         grid.tsx (city × month) · wins.tsx (owner × month) · tabs.tsx
    opportunity/      detail-actions.tsx · note-box.tsx · expand-deal.tsx ·
                      unit-economics.tsx (the cost sheet, editable at any stage)
    admin/            master-data.tsx · users.tsx · cost-defaults.tsx
    skeletons.tsx     the shapes every loading.tsx is built from
    deployments/      board.tsx — the ops queue, partial counts and all
    install-app.tsx   PWA install: a real button on Android, steps on iOS
    ui/               Button, Input, Select, Sheet, Field, ChoiceGroup
    ui-server.tsx     Card, Badge, Avatar, EmptyState (no "use client")
  db/schema.ts        the whole data model in one file
  server/
    auth.ts           requireSession / requireAdmin / requireSales — the only
                      door to a tenant, and the one that keeps ops out
    queries.ts        every read, org-scoped at the source, React-cached
    actions.ts        every write, zod-validated
    stage-change.ts   the stage-move decision, free of Next/Clerk/db so it tests
    invites.ts        asks Clerk to email a new joiner a sign-up link
    invite-url.ts     that link's landing URL — absolute, or not at all
    push.ts           Web Push to one user's browsers; off without VAPID keys
  lib/
    deployment-groups.ts  how the ops queue is cut into sections (by due
                      date, or by city) — no React, so it tests
    lead-funnel.ts    the inbound funnel and its denominators — no React,
                      so the rates are tested
    lead-assignment.ts  who may assign and act on a lead — no React,
                      so the rules are tested
    cost-defaults.ts  which standard rate applies to a deal, and which stored
                      figures have drifted from it — no React, so it tests
    deployment-grid.ts  the Deployments By month grid: which months get a
                      column, and what a cell counts — no React, so it tests
tests/
  stage-change.test.ts          planStageChange, runs anywhere
  cost-defaults.test.ts         the standard-rate matching rules, runs anywhere
  invite-url.test.ts            the absolute-redirect rule, runs anywhere
  deployment-groups.test.ts     the ops queue's two groupings, runs anywhere
  deployment-grid.test.ts       the By month grid's months and cells, anywhere
  lead-funnel.test.ts           the inbound rates and their denominators
  lead-assignment.test.ts       who may assign and act on a lead
  neon-http-driver.test.ts      no db.transaction() anywhere in src/, ever
  closed-won-constraints.test.ts the Postgres checks; needs TEST_DATABASE_URL
drizzle/
  0000_*.sql          initial schema
  0001_*.sql          per-vehicle economics migration
  0002_*.sql          the Contracting stage — ALTER TYPE alone, see § 5
  0003_*.sql          expansion links, invited_at, Contracting's probability
  0004_*.sql          users.invite_url — the accept link, see § 7
  0005_*.sql          the ops role — ALTER TYPE alone, see § 6
  0006_*.sql          deployment_date, vehicles_deployed, their constraints
  0007_*.sql          users.last_seen_at — who has actually signed in
  0008_*.sql          opportunities.operating_days — 26 or 30, recorded only
  0009_*.sql          cost_defaults — the standard rate per cost line
  0010_*.sql          the noc role, lead_status, and the leads table
  0011_*.sql          leads.converted_at — the funnel's third timestamp
  0012_*.sql          leads.assigned_to/by/at + push_subscriptions, see § 0
  meta/               drizzle's journal. Repaired on 22 Sep — see § 6
  bootstrap.sql       schema + tenant + master data + admin, one paste
  demo-data.sql       36 sample deals; cleanup statements at the bottom
```

---

## 4. Tests

```bash
npm test          # logic tests only — no setup, runs anywhere

# with a throwaway Postgres, the database tests run too (see § 5 for how to
# start one). The schema is applied automatically if the database is empty,
# and every test rolls back, so the same scratch database is reusable.
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:5433/crm_test" npm test
```

`node --test` with `tsx` — no test framework, no new dependencies. A hundred and twelve (eight of them on lead assignment — who may assign and act); the older ones:
tests: ten on `planStageChange` (the noop / "fill the sheet" / here-is-the-patch
decision) plus seven more on costing a deal before it is won, six on the
invitation redirect URL, eight on the Deployments groupings (where "this week"
stops, and which city leads), twelve on the By month grid (the month span, the
empty column in the middle, a dateless deal kept aside), eleven on the
cost-default matching rules, and eleven on the inbound funnel's rates and denominators, seven on the expected
deployment date's optional-then-mandatory rule, and twenty-five on what
Postgres itself refuses — the check constraints, the
generated margin columns, the stage order, and the expansion link surviving the
deletion of its parent.

The cost-default tests are worth reading as the specification of that feature:
the full grid, client-paid charging landing on 0, the driver varying by days
alone, a deal that cannot answer what a line varies by, an amount the admin has
not set, a stale row carrying a dimension its line no longer uses, and a real
zero surviving as an answer rather than being read as "unset".

**Leads and the cost-defaults Admin screen have no test coverage** — they are
guards and forms rather than pure functions. The pattern to extend is the two
files above: put the decision in `lib/` or `server/`, free of React, and test
it directly.

Writing them found a real hole: `z.coerce.number()` reads both `null` and `""`
as 0, and `formToObject()` turns every blank field into `null` — so a Closed Won
sheet posted with Revenue empty would have been stored as a won deal earning ₹0.
The check constraint cannot catch that either, because 0 is not null. The cost
sheet's fields are now required *before* they are coerced.

---

## 5. How to verify a change from a sandboxed session

The egress policy in Claude Code web blocks Neon's host, `api.clerk.com` and
`api.vercel.com`. Neon is reachable through the **Neon MCP connector**, and
Vercel through the **Vercel MCP connector** (read-only: it can list projects,
read deployments and build logs, but cannot create projects or set env vars).

To actually see the app, run it locally against a throwaway Postgres. This
caught several bugs that a build alone would not:

```bash
# 1. Local Postgres (initdb refuses to run as root; use a non-root user's home)
useradd -m pgtest
su pgtest -c "PATH=/usr/lib/postgresql/16/bin:\$PATH initdb -D /home/pgtest/data -U postgres"
su pgtest -c "PATH=/usr/lib/postgresql/16/bin:\$PATH pg_ctl -D /home/pgtest/data \
  -o '-p 5433 -h 127.0.0.1 -k /home/pgtest' -l /home/pgtest/log start"
psql "postgresql://postgres@127.0.0.1:5433/postgres" -c "create database demo"
for f in bootstrap 0001_per_vehicle_economics 0002_contracting_stage \
         0003_expansions_and_invites 0004_invite_link demo-data; do
  psql -v ON_ERROR_STOP=1 "postgresql://postgres@127.0.0.1:5433/demo" -f drizzle/$f.sql
done

# 2. Temporarily stub Clerk so pages render (REVERT BEFORE COMMITTING):
#    - src/server/auth.ts: return toSession(row) for LOCAL_E2E_USER_EMAIL
#    - src/app/layout.tsx: drop <ClerkProvider>
#    - src/components/app-shell.tsx: replace the UserButton import with a stub
#    - mv src/middleware.ts src/middleware.ts.bak
DATABASE_URL="postgresql://postgres@127.0.0.1:5433/demo" \
LOCAL_E2E_USER_EMAIL="vivekbhargav.v@gmail.com" npx next dev -p 3020

# 3. Screenshot with the preinstalled Chromium — no proxy, ignore certs
#    chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
#                      args: ["--no-proxy-server"] })
#    newPage({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 },
#              isMobile: true, hasTouch: true })
```

Before committing: `grep -rn "LOCAL_E2E\|zpreview" src/` must print nothing,
and `grep -c ClerkProvider src/app/layout.tsx` must be 3.

`scratchpad/shot.js` in a session like this one walks every screen at 390×844
and reports, per page, the nav width, every tap target under 40px and anything
sticking out past the right edge. That is how the pass on 21 Sep found the
Forecast filter row hanging off the screen and nineteen sub-40px targets in
Admin.

`scratchpad/perf.js` measures the other half: per route, HTML and JS bytes,
DOM-ready under a 4x CPU throttle, long tasks and scroll frame times. The
21 Sep pass used it to find that `/pipeline` was shipping 1,046 KB of HTML
and `/deployments` 3,903 DOM nodes. **A phone downloads and hydrates the
desktop markup too** — `hidden md:block` is CSS, not a skip — so an unbounded
desktop board column costs every phone that never sees it.

**Two checks worth running on every mobile change:**

```js
// Horizontal overflow — but measure the NAV, not the document. On mobile an
// overflowing page widens the layout viewport, so scrollWidth - innerWidth
// reads 0 while a fixed bar silently stretches.
document.querySelector("nav.fixed").getBoundingClientRect().width // must equal 390

// Tap targets under 40px
[...document.querySelectorAll("button,a,select,input")]
  .map(el => ({ t: el.textContent.trim().slice(0,20), h: Math.round(el.getBoundingClientRect().height) }))
  .filter(x => x.h > 0 && x.h < 40)
```

---

## 6. Bugs already found, so you don't re-find them

- **`requestSubmit()` does not exist on iOS Safari < 16.** A submit button
  outside its form calling `formRef.current.requestSubmit()` threw, nothing was
  submitted, and nothing was shown — deals silently never saved. `Sheet` now
  takes an `action` prop and wraps everything in one `<form>` with a real submit
  button inside it. **Never** reintroduce the outside-the-form pattern.
- **A native `<select>` sizes itself to its longest option.** The owner filter
  pushed the Pipeline controls row 11px past the screen, which stretched the
  layout viewport, which made the fixed tab bar 401px wide on that one page.
  It is now an invisible select layered over a 48px icon button.
- **Sibling CTEs cannot see each other's inserts.** `demo-data.sql` inserts
  users and accounts as separate statements for this reason.
- **`en-IN` abbreviates September as "Sept"** — four letters where every other
  month gets three. `monthLabel`, `monthLabelShort` and `formatDate` all slice
  to 3.
- **Postgres generated columns cannot reference other generated columns**, and
  cannot be altered in place — migration 0001 drops and rebuilds them.
- **Underscore-prefixed app folders are private in Next**, so a `__preview`
  route 404s. Name scratch routes `zpreview`.
- **`ALTER TYPE ... ADD VALUE` needs its own migration** — twice now, for
  `contracting` (0002) and `ops` (0005). The value cannot be used in the
  transaction that adds it, so anything referencing it waits for the next file.
- **A new `closed_won` constraint breaks `demo-data.sql`** until the seed sets
  the column too. 0006 added `opps_won_requires_deployment_date`, and the demo
  seed had to start supplying a deployment date and a partial deployed count.
- **A Clerk invitation `redirectUrl` must be ABSOLUTE.** A path is accepted by
  the API, stored in the ticket as `rurl`, and then resolved against Clerk's
  own Frontend API domain when the link is clicked — so `/sign-up` became
  `https://<instance>.clerk.accounts.dev/sign-up`, a 404. Nothing reports it:
  the invitation is created, the email sends, the link is simply dead.
  `invite-url.ts` builds it and `tests/invite-url.test.ts` holds the rule.
- **Drizzle renders a column inside a `sql` template UNQUALIFIED.** A correlated
  subquery written as ``sql`(select count(*) from ${opportunities} where
  ${opportunities.ownerUserId} = ${users.id})` `` becomes
  `where "owner_user_id" = "id"` — and inside the subquery `"id"` resolves to
  the *inner* table. It compares a row to itself, returns 0 for everyone, and
  raises no error. Spell the table name out, or use a join and `GROUP BY`.
- **An untyped parameter in a `VALUES` list defaults to text.** The vehicle-type
  reorder failed at runtime with "sort_order is of type integer but expression
  is of type text" until both columns were cast: `(${id}::uuid, ${i}::int)`.
- **`ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that adds
  it.** That is why `0002` adds the Contracting stage and nothing else, and
  `0003` seeds its probability.
- **Drizzle's migration journal was stale for nine migrations, and
  `db:generate` was dangerous because of it.** `meta/_journal.json` listed only
  `0000`; every migration since was hand-written and never registered. So
  `drizzle-kit generate` diffed the live schema against the *initial* snapshot
  and produced a migration that replayed everything — including **dropping and
  recreating the generated margin columns**. Anyone who ran it and trusted the
  output would have done real damage. Repaired on 22 Sep: the journal now lists
  all eleven migrations with the dates their commits landed, and
  `meta/0010_snapshot.json` describes the current schema, so the next
  `db:generate` emits only true deltas. Verified — it now says *"No schema
  changes, nothing to migrate"*. Only `0000` and `0010` snapshots exist; the
  intermediate ones were never written and cannot be reconstructed honestly.
  **`db:migrate` is not used in this project** (migrations are applied by hand
  or through `bootstrap.sql`), which is why that gap is harmless.
- **Clerk's organization "session task" traps invited users.** With
  Organizations enabled, Clerk holds a new session as *pending* until the
  person picks or creates an organization — showing its own screen before the
  app ever loads. Because Clerk matches the verified email domain, a second
  `moeving.com` user is told an organization already exists and to "join by
  invitation", which this app never sends. See § 0.
- **`beforeinstallprompt` is Chromium-only.** Firefox does not implement it on
  any platform and Mozilla has said it will not, so the PWA install button can
  never appear there. Firefox for Android can still install from its own ⋮
  menu; desktop Firefox cannot install web apps at all. `install-app.tsx` now
  says so per browser instead of showing a Chrome instruction to a Firefox
  user.
- **A new deal had no `revenue`, so its margin could never compute.** Quick Add
  wrote `price` and left `revenue` null; every margin column in Postgres is
  generated from `revenue`, so `total_revenue` was 0 and `margin_pct` null on
  every deal ever created through the app. Nothing errored — the Pipeline's
  Total cost and Margin % columns were simply blank, and the only thing that
  ever fixed a row was editing its price, which is the one edit that carried
  revenue with it. `createOpportunity` now writes both, and **Fill in the
  blanks** (§ 0) repairs the rows that predate it.
- **The Pipeline's totals row was one column out.** The footer closed two
  hidden columns with a single `colSpan={2}` and then printed the blended
  margin in the next cell along — which put it under **Deal Owner**, and left
  **Total cost** with no total at all. It is one `<td>` per column now.
- **Twelve columns do not fit a laptop.** The desktop table needs ~1,270px and
  a 1280px screen gives it ~980 after the rail, so it scrolled — and what
  scrolled off the right was Total cost and Margin %. Price / veh, Deal Owner
  and Updated now wait for `2xl`; the money never hides.
- **The Leads control row collapsed on a phone.** Search, the Open/All switch
  and New lead came to ~490px on a 390px screen, and the search box — the only
  one allowed to shrink — went to 44px with the switch sitting over its own
  placeholder. Two rows on a phone, one from `sm` up.
- **A deal raised from a lead could not be deleted, ever.**
  `leads.opportunity_id` is ON DELETE SET NULL, and
  `leads_converted_requires_opportunity` forbids a converted lead from holding
  a null one — so the cascade fought the check and Postgres refused the whole
  delete. The page caught the throw and said *"Could not delete that. Check
  your connection"*, which sent everybody looking at the wrong thing.
  `deleteOpportunity` now hands the lead back to the desk in the same
  transaction. Reproduced in SQL before the fix and after, and driven through
  the UI.
- **Converting a lead overwrote `actioned_at`** with the moment of conversion,
  destroying the one timestamp that says how long an enquiry waited for its
  callback. `converted_at` is its own column now (0011) and conversion leaves
  `actioned_at` alone. Leads converted BEFORE that migration cannot be
  recovered — their callback and conversion read as the same moment, and the
  backfill deliberately guesses at nothing else.
- **`db.transaction()` throws in production and works locally.** The delete
  fix below was shipped inside one, passed every local test, and failed for
  every real user with *"No transactions support in neon-http driver"* — the
  same "Could not delete that. Check your connection" message as the bug it
  was meant to fix. `src/db/index.ts` picks node-postgres for a local database
  and `drizzle-orm/neon-http` for Neon, and the two do not have the same
  capabilities. **Anything verified only against a local Postgres is verified
  against the wrong driver.** `tests/neon-http-driver.test.ts` now fails the
  build if a transaction reappears; the Neon MCP connector plus a throwaway
  branch (`create_branch`) is how to check real behaviour against the real
  schema without touching live data.
- **New deal refused with "Invalid input: expected string, received null".**
  `formToObject()` posts a blank box as null, and a schema that says
  `.optional()` without `.nullable()` refuses it with Zod's raw message. Any
  optional text field fed through `formToObject()` must be
  `.nullable().optional()`. **Deal name is now REQUIRED** (Vivek, 23 Sep): it
  sits under Customer on New deal, is asked on Convert to deal (pre-filled with
  the company) and on Edit, and the server refuses a blank with "Deal name is
  required". There is no fallback to the customer name any more.
  **The root cause was React 19's form reset.** A `<form action={fn}>` clears
  every uncontrolled field as soon as the action returns, and ours return at
  once (they start their own transition). So any refused save came back with
  Customer, Deal name and Notes wiped; the person retyped the customer, missed
  the name, and the retry failed on the blank. `Sheet` now submits through
  `onSubmit` + `preventDefault()`, which keeps what was typed and still lets
  the browser's `required` checks run first. Reproduced in the browser, fixed,
  and re-checked.
- **The Vercel deployments API reports `BUILDING` after a build is finished.**
  A deployment whose `ready` timestamp is already set keeps coming back as
  `BUILDING` on repeated `get_deployment` calls for minutes. Check
  `list_deployments` with `state=READY` — if the newest READY production
  deployment is still the previous commit, the build genuinely has not landed;
  if `ready` is stamped, it has.

---

## 7. Environment

Set in Vercel (Production + Preview + Development). Values are in the Vercel
dashboard and `.env.local`; they are not in this repo.

```
DATABASE_URL                        Neon pooled connection string
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   pk_test_… (development instance)
CLERK_SECRET_KEY                    sk_test_… (development instance)
NEXT_PUBLIC_CLERK_SIGN_IN_URL       /sign-in
NEXT_PUBLIC_VAPID_PUBLIC_KEY        Web Push public key (safe to ship to browsers)
VAPID_PRIVATE_KEY                   Web Push private key — a secret
VAPID_SUBJECT                       mailto: contact the push services may use
```

- **VAPID keys are generated once** (`npx web-push generate-vapid-keys`) and
  must never change: every browser subscription is bound to the public key, so
  a new pair silently orphans every phone that turned notifications on, and
  each person has to turn them on again.

- **Neon project:** `sparkling-heart-21480913` ("Moeving CRM"),
  `aws-ap-southeast-1`, Postgres 18. Free tier scales to zero, so the first
  request after an idle spell pays a ~500ms cold start.
- **Vercel project:** `good-deal-crm` (`prj_Rpb213Y0l7kkPtDKZ7V9in4VXgH3`),
  team `vivek-5ea1b3e5`, region `sin1`, auto-deploys on push to `main`.
- **Invitation links generated before 21 Sep are dead** — they carried a
  relative redirect (see § 6). Press the mail button in Admin to reissue one.
- **Invitation emails do not reliably arrive.** Clerk accepts
  `createInvitation` and reports success — `invited_at` gets set — but the
  development instance sends from a shared Clerk domain that corporate mail
  (notably `moeving.com`) rejects or files as spam, and nothing reports that
  back. Admin therefore keeps Clerk's accept link in `users.invite_url` and
  offers a **Copy invite link** button. That is a workaround; the cure is the
  production instance below.
- **Clerk:** still on the **development** instance. A production instance needs
  a custom domain first — see README § "Switching Clerk to production keys".
  `pk_live` keys on a `*.vercel.app` URL cannot work: the host baked into the
  key resolves to Vercel's edge, not Clerk's API.

---

## 8. Master data (admin-editable, seeded)

- **Roles:** Admin (everything), Deal Owner (sales), Operations (Deployments
  and Settings only — no pipeline, no pricing, no leads), NOC (Leads and
  Settings only — the desk that answers the phone).
- **Cities**, in review order: Delhi NCR, Bangalore, Hyderabad, Mumbai, Pune,
  Kolkata. Chennai and Ahmedabad exist but are switched off.
- **Vehicle types**, in order: 1T Tata Ace, 1.7T Switch iev4, 1.7T Eicher,
  Ultra E7, Ultra E9. The order is admin-controlled (Admin → Master data) and
  is the order Quick Add shows.
- **Operating days:** 26 (six-day week) or 30 (every day), on the deal. Recorded
  only — nothing computes from it.
- **Cost defaults** (Admin → Cost defaults): Lease varies by vehicle type;
  Driver by operating days; Charging by vehicle type × charging scope; Parking
  by charging scope; Maintenance, Supervisor and Miscellaneous are flat. Seeded
  values and the deliberate blanks are listed in § 0.
- **Stages:** First Contact → Solutioning → Proposal → Negotiation →
  Contracting → Closed Won / Closed Lost / Dormant. Contracting means verbally
  agreed with paperwork in flight.
- **Stage probabilities** (drive the weighted pipeline): 10 / 25 / 50 / 75 /
  90 / 100 / 0 / 0, editable per organization.
- **Driver types:** Driver Only, Driver + Helper, Driver-cum-Delivery.
  **Charging:** Client, MoEVing. Both are icon tiles, not dropdowns.
- **Lost reasons:** 8 seeded, admin-editable.
- **Lead statuses:** New → Qualified / Not qualified → Converted. Not
  admin-editable — they are a database enum, and the deal's sales stages carry
  the detail once a lead becomes a deal.

Team members are **"Deal Owner"** everywhere in the UI. Never "Salesperson",
never "Sales User", never "SPOC".

---

## 8a. Brand assets

One artwork, two crops, everything derived from them:

```
public/logo.png            wordmark + "MAKE IT HAPPEN" — sign-in, sign-up
public/logo-wordmark.png   wordmark without the tagline — desktop rail
public/logo-mark.png       the G-handshake alone
public/icons/icon-192.png  PWA, transparent
public/icons/icon-512.png  PWA, transparent
public/icons/icon-maskable-512.png  PWA maskable: opaque, mark inside the
                           circular safe zone (Android crops to the launcher
                           shape, so a transparent maskable icon loses its edges)
public/icons/apple-touch-icon.png   180px, opaque — iOS renders transparency
                           as black
public/icons/favicon-32.png
src/app/favicon.ico        16/32/48/64 — Next serves it at /favicon.ico with
                           no wiring; the rest are declared in layout.tsx
```

The white studio background is removed with an alpha ramp rather than a
threshold, so the antialiased edges keep the logo's green instead of a white
halo. PNGs are quantised to 128 colours — the gradients survive it and the
files are five to ten times smaller.

**Changing the logo means bumping `SHELL` in `public/sw.js`.** The service
worker caches `/icons/` by URL forever, so an installed phone keeps serving
the old icon until the cache name changes.

## 9. Candidate next upgrades

Roughly in order of value to adoption:

1. **Uncalled-lead nudges, and stale-deal nudges.** A lead sitting in `new`
   for two days and a deal that has not moved in fourteen are the same query
   shape, and `opportunity_events` already records every stage change. This is
   what actually drives CRM usage — everything else is reporting.
2. **A CSV import for leads.** The 26 rows from the SharePoint sheet went in
   by hand through the Neon connector on 22 Sep. If the desk ever collects
   leads anywhere else again, an admin-facing upload beats a session like that
   one.
3. **Offline write queue.** The service worker deliberately caches no pipeline
   data today. Field reps in basements will want a queued "move stage".
4. **Push notifications** for deals closing this week (the PWA manifest and
   service worker are already in place).
5. **Attachments** on a deal — quotes, signed LOIs. Needs blob storage.
6. **Won-deal handover** to ops: the moment a deal is won, someone has to
   actually deliver the trucks. `parent_opportunity_id` already models the
   chain of deployments for one customer, so a handover view has its spine.
7. **A customer page.** Repeat business is now linked deal-to-deal, but there
   is no screen that says "everything we have ever done with Berger Paints".
   `accounts` plus the expansion chain is most of the query.

## 10. Known rough edges

- **Push on an iPhone works only from the installed app** (Add to Home
  Screen, iOS 16.4+). In Safari the Settings switch says so. Android Chrome,
  desktop Chrome/Edge/Firefox work in the browser.
- **Push delivery was verified against a stand-in push service locally**
  (encrypted aes128gcm payload, VAPID-signed, 410 deletes the row), not
  against a real phone — headless Chromium cannot hold a real subscription.
  The first real test is an admin assigning a lead to someone whose phone has
  notifications on.
- **The Leads badge is fresh on navigation, not live.** A lead assigned while
  somebody sits on one page shows when they next move; the push is what tells
  them in the meantime.
- **Changing someone's role from Deal Owner to ops/NOC leaves their leads
  assigned** (suspending releases them; a role change does not). An admin can
  reassign from the card.
- **Assignment keeps no history** — who holds it now, who assigned it and
  when, like the single remark. A `lead_events` table would cover both.

- The top header is translucent glass; the bottom tab bar is solid. Vivek asked
  for the tab bar to be solid specifically. If the mismatch ever annoys him, the
  `glass` utility in `globals.css` comes off the header in one line.
- The Pipeline is capped at 250 rows per query, filtered and searched in SQL.
  Past that cap it needs real pagination, not a bigger cap.
- Desktop drag-and-drop between kanban columns has no touch equivalent — phones
  use the Move stage button instead, which is deliberate.
- Test coverage is the stage-change path and the database rules (§ 4). Quick
  Add, the forecast maths and the CSV export have none; the same two-file
  pattern extends to them.
- **The invitation email has never been seen to arrive**, and on the
  development instance it probably does not — see § 7. Copy invite link is the
  path that works today.
- **An expansion can be moved to a different city while the costs stay the
  parent's.** The sheet warns when the city differs, but nothing stops it; if
  driver or parking rates differ materially by city, that margin is optimistic.
- Only vehicle types are reorderable in Admin. Cities and lost reasons have the
  same `sort_order` column; it is one `orderable` prop each to switch on.
- **Expansions raised before 21 Sep 2026 are dated the old way** — `closed_at`
  and `deployment_date` both set to their deployment month's last day. So an
  old expansion still counts its revenue in the month the trucks went out, and
  still looks due on the 30th, while every new one counts from the day it was
  raised. Nothing migrates them; it would move recorded wins between months.
- **The deployment date cannot be edited after the deal is won.** It is set on
  the Closed Won sheet and by the expansion sheet, and nothing on the
  Deployments page changes it. When ops slips a delivery they can only record
  fewer vehicles, not move the date — an editable date on that page is the
  obvious next addition.
- **Nothing records WHEN a deployment completed**, only how many are out. The
  count is in `opportunity_events` as a note, so "what did we deploy in
  October" needs parsing text. A `deployed_at` column would fix it properly.
  This is the ONE date in the deal's life that is not captured: created,
  expected close, actual close (`closed_at`) and expected deployment all are.
- **The delete-a-deal path is two statements, not a transaction** (see § 6).
  If the delete fails after the lead has been detached, the lead sits back in
  the desk's queue while its deal still exists — visible, and one re-conversion
  away, but not atomic. Real atomicity needs the Neon WebSocket driver.
- **"To deploy" on the Deployments screen now includes Contracting deals**,
  which are not yet owed. That was a deliberate choice (§ 2) over a separate
  uncounted section; the cost is that the headline number is capacity to plan
  for rather than work committed. If it ever misleads, the fix is to exclude
  `isExpected` rows from `totals` in `deployments/board.tsx` — a few lines.
- **The funnel is computed in the browser over every lead**, like the rest of
  the Leads screen. Right for a desk taking a few enquiries a day, wrong at a
  few thousand, where it becomes the same WHERE-clause job the Pipeline
  already had done to it.
- **The funnel is hidden from the NOC desk**, because won/lost counts are deal
  information and NOC sees leads and nothing else. They are the people whose
  work it measures, so if Vivek wants them to see it, the honest version shows
  enquiries/called/converted and stops short of the outcome.
- Role guards are a call at the top of each page — `requireSales()`,
  `requireLeads()`, `requireDealOwner()`, `requireDeployments()`. There are now
  four of them across a dozen call sites plus the CSV route, and a new page has
  to remember to add the right one. Greppable, but not automatic, and picking
  the wrong one is a silent widening rather than an error.
  **Server actions need the same guard as the page that calls them.** An
  action is its own door: until September most deal actions only called
  `requireSession()`, so ops and NOC — refused every commercial page — could
  still create deals, move stages and read cost sheets and wins revenue by
  calling the action directly (the desktop rail even showed them a working New
  deal button). Every commercial action in `actions.ts` and
  `forecast-actions.ts` now calls `requireSales()` or `requireDealOwner()`,
  and `recordDeployment` calls `requireDeployments()`. A new action should do
  the same; `requireSession()` alone is right only for things every role may
  do.
- Nothing runs the tests automatically — there is no CI workflow, so `npm test`
  is a thing a person remembers to type.
- **"Fill in the blanks" walks every deal in the org one UPDATE at a time.**
  Fine at a few hundred; at a few thousand it wants to be one statement. It is
  an admin pressing a button occasionally, not a page load.
- **A lead's Remarks box is on the create form now, but `updateLead` still has
  no screen.** The narrower schema behind it deliberately leaves `remarks`
  alone, so correcting a typo in a lead cannot wipe the remark a deal owner
  left — but there is nothing in the UI that calls it either way.
- **The Deployments By month grid holds every outstanding deployment in the
  page** and does its arithmetic in the browser, unlike Forecast, which asks
  the server per city. Right at today's volume and the reason the detail opens
  instantly; wrong once the queue is thousands of rows.
- **The Leads list loads every lead and filters in the browser.** Right for a
  desk taking a few enquiries a day; wrong at a few thousand, where it becomes
  the same WHERE-clause job the Pipeline already had done to it.
- **A lead keeps one remark, not a history.** Each action overwrites the last,
  with who and when. Two calls on the same lead leave one sentence. A
  `lead_events` table is the honest fix if the desk starts working leads over
  weeks.
- **A deal still has no contact fields.** The caller's name, number and email
  are written into the deal's notes at conversion, which means they are
  searchable but not structured — no click-to-call from the deal, no way to
  list every contact at an account.
- **The imported leads carry the sheet's typos**, because importing them
  verbatim was the honest thing: Medi Link's calling city reads "Dlehi", and
  ZYRKON's goods read "Buildinh Material". Fix them in the app if they bother
  anyone.
- **Leads are not de-duplicated.** Two enquiries from the same company are two
  leads, by design — but nothing warns the desk that the number they are about
  to type was already rung last week.
- **Only `0000` and `0010` drizzle snapshots exist** (see § 6). `db:generate`
  is safe again, but the journal cannot tell you what the schema looked like
  between those two points; git history of `drizzle/*.sql` is the record.
