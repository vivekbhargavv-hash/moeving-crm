-- ============================================================
-- Demo data for Good Deal — 36 opportunities across every stage,
-- city and vehicle type, owned by three sample salespeople.
--
-- Run bootstrap.sql FIRST. Paste this into Neon's SQL Editor to
-- fill the pipeline, forecast and dashboard with something to
-- look at. Closing dates are relative to today, so the forecast
-- always has the current month and the next four populated.
--
-- Everything created here is tagged, so removing it later is one
-- statement — see the very bottom of this file.
-- ============================================================

-- Three sample salespeople. Real people are added in Admin -> Users; these
-- exist only so the "by salesperson" views have something to split on.
-- (Inserted as its own statement: a data-modifying CTE is invisible to its
-- siblings in the same statement, so the rows must be committed first.)
INSERT INTO users (organization_id, email, name, role)
SELECT o.id, r.email, r.name, 'sales'
FROM organizations o, (VALUES
  ('saranyan@demo.moeving.test', 'Saranyan R'),
  ('moin@demo.moeving.test',     'Moin Panwar'),
  ('divya@demo.moeving.test',    'Divya Nair')
) AS r(email, name)
WHERE o.slug = 'moeving'
ON CONFLICT DO NOTHING;

INSERT INTO accounts (organization_id, name)
SELECT o.id, c.name
FROM organizations o, (VALUES
  ('Berger Paints'), ('Terrago Logistics'), ('TCI Express'),
  ('Ceva Logistics'), ('Asian Paints'), ('ITC Last Mile'),
  ('Reefer On'), ('Navata SCS'), ('Pro Connect'),
  ('Viro Foods'), ('Renito Distributors'), ('Compass Retail')
) AS c(name)
WHERE o.slug = 'moeving'
ON CONFLICT DO NOTHING;

WITH org AS (
  SELECT id FROM organizations WHERE slug = 'moeving'
),
rep_list AS (
  SELECT u.id, row_number() OVER (ORDER BY u.email) - 1 AS idx
  FROM users u, org
  WHERE u.organization_id = org.id AND u.email LIKE '%@demo.moeving.test'
),
customer_list AS (
  SELECT a.id, a.name, row_number() OVER (ORDER BY a.name) - 1 AS idx
  FROM accounts a, org WHERE a.organization_id = org.id
),
city_list AS (
  SELECT c.id, c.name, row_number() OVER (ORDER BY c.sort_order) - 1 AS idx
  FROM cities c, org WHERE c.organization_id = org.id
),
vehicle_list AS (
  SELECT v.id, row_number() OVER (ORDER BY v.sort_order) - 1 AS idx
  FROM vehicle_types v, org WHERE v.organization_id = org.id
),
reason_list AS (
  SELECT l.id, row_number() OVER (ORDER BY l.sort_order) - 1 AS idx
  FROM lost_reasons l, org WHERE l.organization_id = org.id
),

-- 36 deals: every stage, city and vehicle type in turn.
grid AS (
  SELECT
    i,
    (ARRAY['first_contact','solutioning','proposal','negotiation',
           'closed_won','closed_lost','dormant'])[(i % 7) + 1]::sales_stage AS stage,
    (ARRAY[3, 5, 10, 15, 20, 25])[(i % 6) + 1]                              AS fleet,
    (ARRAY[38000, 45000, 56000, 68000, 74000, 105000])[(i % 6) + 1]         AS price,
    (ARRAY['driver_only','driver_plus_helper','driver_cum_helper'])[(i % 3) + 1]::driver_type
                                                                            AS driver,
    (ARRAY['client','moeving'])[(i % 2) + 1]::charging_scope                AS charging,
    (date_trunc('month', now()) + ((i % 5) || ' months')::interval
       + interval '1 month' - interval '1 day')::date                       AS close_date
  FROM generate_series(0, 35) AS i
)

INSERT INTO opportunities (
  organization_id, account_id, name, stage, city_id, vehicle_type_id,
  driver_type, charging_scope, fleet_size, price, expected_close_date,
  owner_user_id, notes,
  revenue, lease_cost, driver_cost, charging_cost, parking_cost,
  maintenance_cost, supervisor_cost, misc_cost,
  lost_reason_id, closed_at
)
SELECT
  org.id, cu.id, cu.name || ' - ' || ci.name, g.stage, ci.id, ve.id,
  g.driver, g.charging, g.fleet, g.price, g.close_date, re.id,
  '[demo] Sample deal - safe to delete.',
  -- Won deals carry a full cost sheet; the check constraint requires it.
  CASE WHEN g.stage = 'closed_won' THEN g.price * g.fleet END,
  CASE WHEN g.stage = 'closed_won' THEN round(g.price * g.fleet * 0.46) END,
  CASE WHEN g.stage = 'closed_won' THEN round(g.price * g.fleet * 0.22) END,
  CASE WHEN g.stage = 'closed_won' THEN round(g.price * g.fleet * 0.09) END,
  CASE WHEN g.stage = 'closed_won' THEN round(g.price * g.fleet * 0.03) END,
  CASE WHEN g.stage = 'closed_won' THEN round(g.price * g.fleet * 0.04) END,
  CASE WHEN g.stage = 'closed_won' THEN round(g.price * g.fleet * 0.03) END,
  CASE WHEN g.stage = 'closed_won' THEN round(g.price * g.fleet * 0.02) END,
  CASE WHEN g.stage = 'closed_lost' THEN rs.id END,
  CASE WHEN g.stage IN ('closed_won','closed_lost') THEN now() END
FROM grid g
CROSS JOIN org
JOIN customer_list cu ON cu.idx = g.i % 12
JOIN city_list     ci ON ci.idx = g.i % 8
JOIN vehicle_list  ve ON ve.idx = g.i % 4
JOIN rep_list      re ON re.idx = g.i % 3
JOIN reason_list   rs ON rs.idx = g.i % 8
-- Only seed an empty pipeline; re-running never doubles up.
WHERE NOT EXISTS (
  SELECT 1 FROM opportunities o WHERE o.organization_id = org.id
);

SELECT count(*) AS opportunities, sum(fleet_size) AS vehicles FROM opportunities;

-- ============================================================
-- To remove the demo data later, run these three, in this order:
--
--   DELETE FROM opportunities WHERE notes LIKE '[demo]%';
--   DELETE FROM accounts a WHERE NOT EXISTS (
--     SELECT 1 FROM opportunities o WHERE o.account_id = a.id);
--   DELETE FROM users WHERE email LIKE '%@demo.moeving.test';
-- ============================================================
