-- The accept link Clerk returns when an invitation is created.
--
-- Clerk accepts the invitation and reports success, but on the development
-- instance the email is sent from a shared Clerk domain that corporate mail
-- routinely rejects or files as spam — so the person never gets it. Keeping
-- the link lets an admin hand it over directly.
--
-- It is a sign-up credential for that one address, readable only by an admin
-- of the same organization, and cleared the moment they sign in.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_url" text;
