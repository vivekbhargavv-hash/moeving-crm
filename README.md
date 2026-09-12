# Good Deal

A mobile-first sales CRM for MoEVing's EV logistics team. Five screens, no
modules, no tabs-inside-tabs: pipeline, closure forecast, dashboard, deal
detail, and a quick-add that takes under 30 seconds.

Next.js 15 · TypeScript · Tailwind v4 · Neon Postgres · Drizzle · Clerk · PWA

---

## Getting it running

```bash
cp .env.example .env.local     # fill in Neon + Clerk
npm install
npm run db:push                # creates the schema
npm run db:seed                # org, master data, your admin user
npm run dev
```

Add `-- --demo` to the seed for ~36 sample deals to click around in:
`npm run db:seed -- --demo`.

**No Node to hand, or port 5432 blocked?** Paste `drizzle/bootstrap.sql` into
Neon's SQL Editor instead. It creates the schema, the MoEVing organization, all
master data and the first admin in one go, and is safe to run twice.
`scripts/apply-migration.mjs` does the same over Neon's HTTPS endpoint when only
443 is open.

### Adding the team

1. Admin → Users → Add user (name, work email, role).
2. Invite that **same email** in the Clerk dashboard.
3. On first sign-in the two are linked automatically. An email Clerk knows but
   the CRM doesn't lands on `/no-access` rather than inside someone else's data.

### Deploying

Push to GitHub, import the repo in Vercel, set the same environment variables,
deploy. `npm run db:push` against the production `DATABASE_URL` applies the
schema. On a phone: open the URL → Share → Add to Home Screen.

---

## How it is put together

### Money and units

`price` is the **monthly rent per vehicle**. A deal's value is always
`price × fleet_size`, i.e. a monthly run-rate — that is what "Pipeline value"
and every chart mean. Amounts are whole rupees in `integer` columns: no paise,
no floats, no numeric-as-string round trips.

### Tenant isolation

V1 serves MoEVing alone, but every table carries `organization_id` from day
one. The rule that keeps it honest: `requireSession()` in `src/server/auth.ts`
is the only place an `organization_id` is ever produced, and it comes from the
Clerk session — never from a form field, a query string or a header. Every
query and mutation composes that value into its `where`. Adding a second
organization is then a row, not a migration.

### Margin maths live in the database

`total_cost`, `gross_margin` and `margin_pct` are Postgres generated columns,
so no two screens can disagree about a deal's margin. Two check constraints
back the workflow rules:

- `closed_won` requires revenue **and** all seven cost fields
- `closed_lost` requires a reason

Open deals require none of it — the cost sheet is asked for exactly once, at the
moment the deal is won.

### Stage probabilities

Weighted pipeline uses per-stage probabilities stored per organization
(10/25/50/75 by default), so management can retune the forecast without a
deploy.

### Offline

The service worker makes the app installable and fast to open; it deliberately
does **not** cache pipeline data or queue offline writes. A CRM showing a
salesperson stale numbers is worse than one that says "you're offline".

---

## Layout

```
src/
  app/
    (app)/          pipeline · forecast · dashboard · opportunities/[id] · admin
    sign-in, sign-up, no-access, offline
  components/       app shell, quick add, stage changer, charts, admin
  db/schema.ts      the whole data model, in one file
  server/
    auth.ts         requireSession / requireAdmin — the only door to a tenant
    queries.ts      every read, org-scoped at the source
    actions.ts      every write, zod-validated
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Apply the schema to `DATABASE_URL` |
| `npm run db:generate` | Write a SQL migration into `drizzle/` |
| `npm run db:seed` | Org + master data + admin (`-- --demo` for sample deals) |
| `node scripts/make-icons.mjs` | Regenerate the PWA icons |

A `DATABASE_URL` that isn't a Neon host is opened with plain node-postgres, so a
local Postgres works for development and tests without touching app code.
