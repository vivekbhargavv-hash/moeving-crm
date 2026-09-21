import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inviteRedirectUrl } from "@/server/invite-url";

/**
 * The regression these exist for: an invitation was created with
 * `redirectUrl: "/sign-up"`. Clerk accepted it, the email sent, and the link
 * resolved that path against Clerk's own Frontend API domain — a 404 that
 * nothing reported until somebody clicked it.
 */
describe("inviteRedirectUrl", () => {
  it("builds an absolute sign-up URL from an origin", () => {
    assert.equal(
      inviteRedirectUrl("https://good-deal-crm.vercel.app"),
      "https://good-deal-crm.vercel.app/sign-up",
    );
  });

  it("refuses a bare path — the bug", () => {
    for (const bad of ["/sign-up", "/", "sign-up", "good-deal-crm.vercel.app"]) {
      assert.equal(
        inviteRedirectUrl(bad),
        undefined,
        `${bad} must not be used as a redirect`,
      );
    }
  });

  it("refuses nothing at all rather than inventing an origin", () => {
    for (const empty of [null, undefined, "", "   "]) {
      assert.equal(inviteRedirectUrl(empty), undefined);
    }
  });

  it("does not double the slash on a trailing-slash origin", () => {
    assert.equal(
      inviteRedirectUrl("https://good-deal-crm.vercel.app/"),
      "https://good-deal-crm.vercel.app/sign-up",
    );
  });

  it("keeps a port, for a local run", () => {
    assert.equal(
      inviteRedirectUrl("http://127.0.0.1:3020"),
      "http://127.0.0.1:3020/sign-up",
    );
  });

  it("refuses an origin that already carries a path", () => {
    // A path here would land the ticket somewhere unintended.
    assert.equal(inviteRedirectUrl("https://example.com/app"), undefined);
  });
});
