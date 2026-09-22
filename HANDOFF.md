# Good Deal — Session Handoff

**Last updated:** 21 September 2026 (fourth session)
**Owner:** Vivek (product owner, not a programmer — explain in plain English)
**Repo:** `vivekbhargavv-hash/moeving-crm`, branch `main` (push straight to it)
**Live:** https://good-deal-crm.vercel.app

Read this, then `README.md` for setup mechanics.

---

## 0. START HERE — the things waiting on a human

**Migrations 0000–0007 are all applied to production.** Nothing to run.

1. **Rotate the Clerk secret key.** `sk_live_…` was pasted into a chat
   transcript. Clerk → API Keys → regenerate. A live secret can read and
   modify the entire user store.
2. **The GitHub repo is public.** Settings → General → Change visibility →
   Private. Nothing secret is committed (`.env.local` is gitignored), but the
   schema and pipeline logic are readable by anyone.
3. **The production database is live and empty of demo data.** On 21 Sep every
   deal, deal event and customer was deleted — the 36 demo ones and the 9 real
   ones — and the team is now entering live data. Users, cities, vehicle types,
   lost reasons and stage probabilities were kept. A Neon snapshot,
   `before-live-data-wipe-21sep2026`, holds the state from just before.
   `drizzle/demo-data.sql` is still in the repo: running it now would put fake
   deals into live data.

---

## 1. What this is

A mobile-first sales CRM for MoEVing's EV logistics team, built because vTiger
has everything and gets used by nobody. Five screens, large touch targets, a
deal you can move in two taps from a phone.

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Neon Postgres · Drizzle ·
Clerk · installable PWA · Vercel.

**Screens:** Dashboard · Pipeline (board + list) · Forecast (forecast + wins) ·
Deal detail · Quick Add · Deployments (the ops queue) · Settings (install) ·
Admin (users, master data).

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
| **Wins count on `closed_at`**, not `expected_close_date`. | The expected date is a forecast and usually wrong by the time a deal lands. |
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

---

## 3. Layout

```
src/
  app/
    (app)/            dashboard · pipeline · forecast · opportunities/[id]
                      deployments (everyone) · settings (everyone)
                      admin (admins)
    api/export/deals  CSV export (org-scoped, UTF-8 BOM for Excel)
    sign-in, sign-up, no-access, offline
  components/
    app-shell.tsx     mobile header + tab bar + desktop rail + toast
    quick-add.tsx     the 30-second create sheet
    stage-changer.tsx stage picker + Closed Won cost sheet + Closed Lost reason
    pipeline/         board.tsx (kanban) · table.tsx (list + table) · filters.tsx
    forecast/         grid.tsx (city × month) · wins.tsx (owner × month) · tabs.tsx
    opportunity/      detail-actions.tsx · note-box.tsx · expand-deal.tsx
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
  lib/
    deployment-groups.ts  how the ops queue is cut into sections (by due
                      date, or by city) — no React, so it tests
tests/
  stage-change.test.ts          planStageChange, runs anywhere
  invite-url.test.ts            the absolute-redirect rule, runs anywhere
  deployment-groups.test.ts     the ops queue's two groupings, runs anywhere
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

`node --test` with `tsx` — no test framework, no new dependencies. Forty-nine
tests: ten on `planStageChange` (the noop / "fill the sheet" / here-is-the-patch
decision), six on the invitation redirect URL, eight on the Deployments
groupings (where "this week" stops, and which city leads), and twenty-five on
what Postgres itself refuses — the two check
constraints, the generated margin columns, the stage order, and the expansion
link surviving the deletion of its parent.

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

---

## 7. Environment

Set in Vercel (Production + Preview + Development). Values are in the Vercel
dashboard and `.env.local`; they are not in this repo.

```
DATABASE_URL                        Neon pooled connection string
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   pk_test_… (development instance)
CLERK_SECRET_KEY                    sk_test_… (development instance)
NEXT_PUBLIC_CLERK_SIGN_IN_URL       /sign-in
```

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
  and Settings only — no pipeline, no pricing).
- **Cities**, in review order: Delhi NCR, Bangalore, Hyderabad, Mumbai, Pune,
  Kolkata. Chennai and Ahmedabad exist but are switched off.
- **Vehicle types:** 1 Tonne, 1.7 Tonne, Ultra E7, Ultra E9. The order is
  admin-controlled (Admin → Master data) and is the order Quick Add shows.
- **Stages:** First Contact → Solutioning → Proposal → Negotiation →
  Contracting → Closed Won / Closed Lost / Dormant. Contracting means verbally
  agreed with paperwork in flight.
- **Stage probabilities** (drive the weighted pipeline): 10 / 25 / 50 / 75 /
  90 / 100 / 0 / 0, editable per organization.
- **Driver types:** Driver Only, Driver + Helper, Driver-cum-Delivery.
  **Charging:** Client, MoEVing. Both are icon tiles, not dropdowns.
- **Lost reasons:** 8 seeded, admin-editable.

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

1. **Stale-deal nudges.** `opportunity_events` already records every stage
   change, so "nothing has moved in 14 days" is one query. This is what
   actually drives CRM usage — everything else is reporting.
2. **Offline write queue.** The service worker deliberately caches no pipeline
   data today. Field reps in basements will want a queued "move stage".
3. **Push notifications** for deals closing this week (the PWA manifest and
   service worker are already in place).
4. **Attachments** on a deal — quotes, signed LOIs. Needs blob storage.
5. **Won-deal handover** to ops: the moment a deal is won, someone has to
   actually deliver the trucks. `parent_opportunity_id` already models the
   chain of deployments for one customer, so a handover view has its spine.
6. **A customer page.** Repeat business is now linked deal-to-deal, but there
   is no screen that says "everything we have ever done with Berger Paints".
   `accounts` plus the expansion chain is most of the query.

## 10. Known rough edges

- The top header is translucent glass; the bottom tab bar is solid. Vivek asked
  for the tab bar to be solid specifically. If the mismatch ever annoys him, the
  `glass` utility in `globals.css` comes off the header in one line.
- The Pipeline loads every deal for the organization. Fine at tens or hundreds;
  it will need pagination in the thousands.
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
- Pipeline filters are applied in the browser over the deals already loaded.
  Right at the scale where the Pipeline needs pagination, they need to move to
  the query — the `OpportunityFilters` type in `queries.ts` already has the
  shape for it.
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
- Ops users are kept out of commercial pages by a `requireSales()` call at the
  top of each one. That is four call sites plus the CSV route, and a new page
  has to remember to add it — greppable, but not automatic.
- Nothing runs the tests automatically — there is no CI workflow, so `npm test`
  is a thing a person remembers to type.
