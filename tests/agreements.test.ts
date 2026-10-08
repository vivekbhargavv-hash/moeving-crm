import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  agreementFolder,
  daysUntil,
  fileProblem,
  isCovered,
  isInFolder,
  renewalsDue,
  renewalState,
  safeFileName,
} from "../src/lib/agreements";

/**
 * Signed customer agreements. The cases worth pinning are the ones a
 * screenshot would not show: which won deals count as covered, which renewal
 * reminders a newer contract quietly retires, and which file paths the server
 * will accept as this organization's.
 */

const deal = (id: string, parentOpportunityId: string | null = null) => ({
  id,
  parentOpportunityId,
});

describe("isCovered", () => {
  it("a customer-wide agreement covers every deal for that customer", () => {
    assert.equal(isCovered(deal("d1"), [{ opportunityId: null }]), true);
  });

  it("an agreement for one deal covers that deal", () => {
    assert.equal(isCovered(deal("d1"), [{ opportunityId: "d1" }]), true);
  });

  it("an agreement for one deal does not cover a different deal", () => {
    assert.equal(isCovered(deal("d2"), [{ opportunityId: "d1" }]), false);
  });

  it("an expansion runs on its parent deal's agreement", () => {
    assert.equal(isCovered(deal("x1", "d1"), [{ opportunityId: "d1" }]), true);
  });

  it("no agreements, no cover", () => {
    assert.equal(isCovered(deal("d1"), []), false);
  });
});

const ag = (
  id: string,
  renewalOn: string,
  accountId = "acme",
  opportunityId: string | null = null,
  type: "msa" | "addendum" | "other" = "msa",
  signedOn = "2025-01-01",
) => ({ id, accountId, opportunityId, type, signedOn, renewalOn });

const TODAY = "2026-10-08";

describe("renewalState", () => {
  it("is overdue once the date has passed", () => {
    assert.equal(renewalState("2026-10-07", TODAY), "overdue");
  });
  it("is due on the day itself", () => {
    assert.equal(renewalState(TODAY, TODAY), "due");
  });
  it("is due up to sixty days out", () => {
    assert.equal(renewalState("2026-12-07", TODAY), "due");
  });
  it("is later beyond sixty days", () => {
    assert.equal(renewalState("2026-12-08", TODAY), "later");
  });
});

describe("renewalsDue", () => {
  it("lists what is due and what has lapsed, soonest first", () => {
    const due = renewalsDue(
      [ag("a", "2026-11-20", "acme"), ag("b", "2026-09-30", "zeta"), ag("c", "2027-06-01", "kilo")],
      TODAY,
    );
    assert.deepEqual(due.map((a) => a.id), ["b", "a"]);
  });

  it("retires a reminder once the renewed contract is uploaded", () => {
    const due = renewalsDue(
      [ag("old", "2026-09-30"), ag("renewed", "2027-09-30")],
      TODAY,
    );
    assert.deepEqual(due, []);
  });

  it("tells the desk once when an addendum shares the MSA's renewal date", () => {
    const due = renewalsDue(
      [
        ag("addendum", "2026-11-01", "acme", null, "addendum", "2026-03-01"),
        ag("msa", "2026-11-01", "acme", null, "msa", "2025-11-01"),
      ],
      TODAY,
    );
    assert.deepEqual(due.map((a) => a.id), ["msa"]);
  });

  it("keeps an addendum that renews on its own, earlier date", () => {
    const due = renewalsDue(
      [ag("msa", "2026-11-20"), ag("addendum", "2026-10-31", "acme", null, "addendum")],
      TODAY,
    );
    // The MSA renews later, so it retires the addendum's reminder: the
    // addendum lapses inside the contract that is still running.
    assert.deepEqual(due.map((a) => a.id), ["msa"]);
  });

  it("does not let another customer's contract retire this one", () => {
    const due = renewalsDue(
      [ag("acme", "2026-11-01", "acme"), ag("zeta", "2027-11-01", "zeta")],
      TODAY,
    );
    assert.deepEqual(due.map((a) => a.id), ["acme"]);
  });

  it("does not let one deal's contract retire a different deal's", () => {
    const due = renewalsDue(
      [ag("d1", "2026-11-01", "acme", "deal-1"), ag("d2", "2027-11-01", "acme", "deal-2")],
      TODAY,
    );
    assert.deepEqual(due.map((a) => a.id), ["d1"]);
  });

  it("does not merge two deals' papers that happen to renew the same day", () => {
    const due = renewalsDue(
      [ag("d1", "2026-11-01", "acme", "deal-1"), ag("d2", "2026-11-01", "acme", "deal-2")],
      TODAY,
    );
    assert.deepEqual(due.map((a) => a.id).sort(), ["d1", "d2"]);
  });

  it("lets a new customer-wide contract retire a deal's", () => {
    const due = renewalsDue(
      [ag("d1", "2026-11-01", "acme", "deal-1"), ag("msa", "2027-11-01", "acme", null)],
      TODAY,
    );
    assert.deepEqual(due, []);
  });
});

describe("daysUntil", () => {
  it("counts forward, and backward once passed", () => {
    assert.equal(daysUntil("2026-10-18", TODAY), 10);
    assert.equal(daysUntil("2026-10-01", TODAY), -7);
  });
});

describe("files", () => {
  const file = (size: number, type: string, name = "x.pdf") => ({ size, type, name });

  it("takes a signed PDF", () => {
    assert.equal(fileProblem(file(2_000_000, "application/pdf")), null);
  });
  it("takes a HEIC photo whose phone sent no type", () => {
    assert.equal(fileProblem(file(2_000_000, "", "IMG_0042.HEIC")), null);
  });
  it("refuses an empty file", () => {
    assert.match(fileProblem(file(0, "application/pdf"))!, /empty/);
  });
  it("refuses anything over 25 MB", () => {
    assert.match(fileProblem(file(26 * 1024 * 1024, "application/pdf"))!, /25 MB/);
  });
  it("refuses a spreadsheet", () => {
    assert.ok(fileProblem(file(1000, "application/vnd.ms-excel", "x.xls")));
  });
});

describe("blob paths", () => {
  const folder = agreementFolder("org-1", "acct-1");

  it("keeps a file under its organization and customer", () => {
    assert.equal(folder, "agreements/org-1/acct-1/");
    assert.equal(isInFolder(`${folder}msa-ab12.pdf`, folder), true);
  });
  it("refuses another organization's file", () => {
    assert.equal(isInFolder("agreements/org-2/acct-1/msa.pdf", folder), false);
  });
  it("refuses a path that climbs out", () => {
    assert.equal(isInFolder(`${folder}../../org-2/x.pdf`, folder), false);
  });
  it("makes a file name safe without losing what it says", () => {
    assert.equal(safeFileName("Berger Paints – MSA (signed).pdf"), "Berger-Paints-MSA-signed.pdf");
    assert.equal(safeFileName("###"), "agreement");
  });
});
