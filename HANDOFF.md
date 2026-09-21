# Good Deal — Session Handoff

**Last updated:** 21 September 2026 (third session)
**Owner:** Vivek (product owner, not a programmer — explain in plain English)
**Repo:** `vivekbhargavv-hash/moeving-crm`, branch `main` (push straight to it)
**Live:** https://good-deal-crm.vercel.app

Read this, then `README.md` for setup mechanics.

---

## 0. START HERE — the things waiting on a human

**Migrations 0000–0004 are all applied to production.** Nothing to run.

1. **Rotate the Clerk secret key.** `sk_live_…` was pasted into a chat
   transcript. Clerk → API Keys → regenerate. A live secret can read and
   modify the entire user store.
2. **The GitHub repo is public.** Settings → General → Change visibility →
   Private. Nothing secret is committed (`.env.local` is gitignored), but the
   schema and pipeline logic are readable by anyone.
3. **Demo data is still in the production database.** 36 sample deals across
   12 fake customers. Removal is three statements at the bottom of
   `drizzle/demo-data.sql`. Do this before the team starts entering real deals,
   or the dashboard will mix the two.

---

## 1. What this is

A mobile-first sales CRM for MoEVing's EV logistics team, built because vTiger
has everything and gets used by nobody. Five screens, large touch targets, a
deal you can move in two taps from a phone.

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Neon Postgres · Drizzle ·
Clerk · installable PWA · Vercel.

**Screens:** Dashboard · Pipeline (board + list) · Forecast (forecast + wins) ·
Deal detail · Quick Add · Settings (install) · Admin (users, master data).

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
| **A deal owner's Pipeline opens on their own deals; only admins get All owners.** | A rep scrolling past thirty other people's deals stops opening the app. It is a default view, not a permission — the server still sends the whole org and any owner can be picked by name. |
| **The Pipeline opens on the table, sorted by most recently updated.** | What moved since you last looked is the reason to open the screen. The board is one tap away and the choice is remembered per person. |
| **Repeat business is a NEW deal linked to the won one** (`parent_opportunity_id`), never an edit to the won row. | A won deal that grows would move a recorded win out of the month it happened in and silently restate Wins-by-month. |
| **An expansion asks only city, fleet and deployment month.** Everything else is copied off the parent BY THE SERVER, not by the form. | The unit economics came with that contract. Copying server-side means the lock is real: posting `price` or `stage` into that action changes nothing. |
| **An expansion lands as `closed_won` with `closed_at` = the deployment month.** | Nothing is being sold, so it is not a pipeline stage; and the revenue belongs to the month the trucks go out, not the day the paperwork was raised. Its cost sheet is the parent's, so margin_pct and total_cost compute themselves. |
| **Deleting a `closed_won` deal is admin-only**; anything open is the owner's to delete. | A win is a month in the wins report and a slice of reported margin. Deleting one restates both. |
| **Suspending, not deleting, is how someone leaves.** `owner_user_id` is `ON DELETE RESTRICT`. | Their name is part of the history of every deal they closed. Delete is offered only for a row that owns nothing — a wrong address typed in. |
| **Auth checks sit next to the data**, not in middleware path matching. | Clerk deprecated `createRouteMatcher` for exactly this reason: path matching drifts from how Next routes requests. |
| **Vercel functions are pinned to `sin1`** in `vercel.json`. | Neon is in `ap-southeast-1`. They were in Washington DC; every query crossed the Pacific twice. |

---

## 3. Layout

```
src/
  app/
    (app)/            dashboard · pipeline · forecast · opportunities/[id]
                      settings (everyone) · admin (admins)
    api/export/deals  CSV export (org-scoped, UTF-8 BOM for Excel)
    sign-in, sign-up, no-access, offline
  components/
    app-shell.tsx     mobile header + tab bar + desktop rail + toast
    quick-add.tsx     the 30-second create sheet
    stage-changer.tsx stage picker + Closed Won cost sheet + Closed Lost reason
    pipeline/         board.tsx (kanban) · table.tsx (list + table) · filters.tsx
    forecast/         grid.tsx (city × month) · wins.tsx (owner × month) · tabs.tsx
    opportunity/      detail-actions.tsx · note-box.tsx · expand-deal.tsx
    install-app.tsx   PWA install: a real button on Android, steps on iOS
    ui/               Button, Input, Select, Sheet, Field, ChoiceGroup
    ui-server.tsx     Card, Badge, Avatar, EmptyState (no "use client")
  db/schema.ts        the whole data model in one file
  server/
    auth.ts           requireSession / requireAdmin — the only door to a tenant
    queries.ts        every read, org-scoped at the source, React-cached
    actions.ts        every write, zod-validated
    stage-change.ts   the stage-move decision, free of Next/Clerk/db so it tests
    invites.ts        asks Clerk to email a new joiner a sign-up link
    invite-url.ts     that link's landing URL — absolute, or not at all
tests/
  stage-change.test.ts          planStageChange, runs anywhere
  invite-url.test.ts            the absolute-redirect rule, runs anywhere
  closed-won-constraints.test.ts the Postgres checks; needs TEST_DATABASE_URL
drizzle/
  0000_*.sql          initial schema
  0001_*.sql          per-vehicle economics migration
  0002_*.sql          the Contracting stage — ALTER TYPE alone, see § 5
  0003_*.sql          expansion links, invited_at, Contracting's probability
  0004_*.sql          users.invite_url — the accept link, see § 7
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

`node --test` with `tsx` — no test framework, no new dependencies. Thirty-two
tests: nine on `planStageChange` (the noop / "fill the sheet" / here-is-the-patch
decision), six on the invitation redirect URL, and seventeen on what Postgres
itself refuses — the two check
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
- **An expansion dated in a future month is invisible on the Wins tab** until
  that month arrives, because Wins shows `pastMonths(6)`. It is a Closed Won
  deal immediately, so it does show in the Pipeline. That is the direct
  consequence of dating the win by deployment month, and it is intended, but it
  surprises people who expect to see it straight away.
- **An expansion can be moved to a different city while the costs stay the
  parent's.** The sheet warns when the city differs, but nothing stops it; if
  driver or parking rates differ materially by city, that margin is optimistic.
- Pipeline filters are applied in the browser over the deals already loaded.
  Right at the scale where the Pipeline needs pagination, they need to move to
  the query — the `OpportunityFilters` type in `queries.ts` already has the
  shape for it.
- Only vehicle types are reorderable in Admin. Cities and lost reasons have the
  same `sort_order` column; it is one `orderable` prop each to switch on.
- Nothing runs the tests automatically — there is no CI workflow, so `npm test`
  is a thing a person remembers to type.
