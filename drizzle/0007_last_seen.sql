-- Who has actually started using the CRM, and when they were last in.
--
-- Admin showed an amber "Invited" badge until someone signed in and then
-- nothing at all, so there was no way to tell a person who signed in once in
-- March from one who was in this morning.
--
-- `requireSession()` writes this, throttled to once every few minutes per
-- person, so it does not add a write to every page view.
--
-- NOT backfilled on purpose. Anyone already linked to Clerk has signed in at
-- least once, but nothing recorded when, and `created_at` is the moment an
-- admin typed their address — not a moment they were ever here. Admin shows
-- them as "Signed in" with no date until their next page view, which writes a
-- real one within seconds of them opening the app.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone;
