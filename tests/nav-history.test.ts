import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { backLabel, previousPage, recordPage } from "@/lib/nav-history";

// A tab's sessionStorage, enough of it for these functions.
const store = new Map<string, string>();
Object.assign(globalThis, {
  sessionStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
});

describe("previousPage", () => {
  beforeEach(() => store.clear());

  it("is the page before, filters and all", () => {
    recordPage("/pipeline?scope=all&stage=proposal");
    recordPage("/opportunities/abc");
    assert.equal(previousPage("/opportunities/abc"), "/pipeline?scope=all&stage=proposal");
  });

  it("is right before the shell has recorded the page being rendered", () => {
    // A page's effects run before the shell's.
    recordPage("/leads");
    assert.equal(previousPage("/opportunities/abc"), "/leads");
  });

  it("does not count a re-render of the same page as a move", () => {
    recordPage("/forecast");
    recordPage("/opportunities/abc");
    recordPage("/opportunities/abc");
    assert.equal(previousPage("/opportunities/abc"), "/forecast");
  });

  it("is null in a fresh tab", () => {
    assert.equal(previousPage("/opportunities/abc"), null);
  });
});

describe("backLabel", () => {
  it("names the section the link goes back to", () => {
    assert.equal(backLabel("/pipeline?scope=all"), "Pipeline");
    assert.equal(backLabel("/leads"), "Leads");
    assert.equal(backLabel("/forecast?tab=wins"), "Forecast");
    assert.equal(backLabel("/opportunities/xyz"), "Back");
  });

  it("offers nothing for pages a deal is not opened from", () => {
    assert.equal(backLabel("/settings"), null);
    assert.equal(backLabel("/admin/users"), null);
  });
});
