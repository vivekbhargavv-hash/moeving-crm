import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { keyFromRequest, parseInboundLead } from "@/lib/inbound-lead";

const TODAY = "2026-11-26";

describe("parseInboundLead", () => {
  it("reads the documented example", () => {
    const out = parseInboundLead(
      {
        name: "Ravi Kumar",
        company: "Ksherera Dairy",
        phone: "+91 98450 12345",
        email: "Ravi@Ksherera.in",
        city: "Bangalore",
        vehicles: 5,
        vehicle_type: "3W",
        goods: "Dairy",
        message: "Need 5 EVs",
      },
      TODAY,
    );
    assert.ok(out.ok);
    assert.deepEqual(out.lead, {
      enquiryDate: TODAY,
      companyName: "Ksherera Dairy",
      callerName: "Ravi Kumar",
      mobile: "+91 98450 12345",
      email: "ravi@ksherera.in",
      callingCity: "Bangalore",
      vehicleType: "3W",
      vehicleRequirement: 5,
      typeOfGoods: "Dairy",
      designation: null,
      foundOn: "Website chatbot",
      remarks: "Need 5 EVs",
    });
  });

  it("matches names whatever their case, spacing or punctuation", () => {
    const out = parseInboundLead(
      { "Mobile Number": "9845012345", "First Name": "Asha", "last-name": "Rao", "Company_Name": "Rao Foods" },
      TODAY,
    );
    assert.ok(out.ok);
    assert.equal(out.lead.mobile, "9845012345");
    assert.equal(out.lead.callerName, "Asha Rao");
    assert.equal(out.lead.companyName, "Rao Foods");
  });

  it("reads fields wrapped under data / lead, as Zapier and webhooks send them", () => {
    const out = parseInboundLead({ event: "lead", data: { whatsapp: "9845012345", name: "Asha" } }, TODAY);
    assert.ok(out.ok);
    assert.equal(out.lead.mobile, "9845012345");
  });

  it("refuses a lead nobody can call back", () => {
    const out = parseInboundLead({ name: "Asha", email: "not an email" }, TODAY);
    assert.equal(out.ok, false);
  });

  it("stands the person's name in for a missing company", () => {
    const out = parseInboundLead({ name: "Asha", email: "asha@x.in" }, TODAY);
    assert.ok(out.ok);
    assert.equal(out.lead.companyName, "Asha");
    const bare = parseInboundLead({ phone: "9845012345" }, TODAY);
    assert.ok(bare.ok);
    assert.equal(bare.lead.companyName, "Website visitor");
  });

  it("reads a count out of words, and ignores nonsense", () => {
    const words = parseInboundLead({ phone: "1", vehicles: "about 12 trucks" }, TODAY);
    assert.ok(words.ok);
    assert.equal(words.lead.vehicleRequirement, 12);
    const none = parseInboundLead({ phone: "1", vehicles: "a few" }, TODAY);
    assert.ok(none.ok);
    assert.equal(none.lead.vehicleRequirement, null);
  });

  it("cuts over-long text instead of refusing the lead", () => {
    const out = parseInboundLead({ phone: "1", message: "x".repeat(5000) }, TODAY);
    assert.ok(out.ok);
    assert.equal(out.lead.remarks!.length, 2000);
  });

  it("takes a real past date, and today for anything else", () => {
    const at = (date: string) => {
      const out = parseInboundLead({ phone: "1", date }, TODAY);
      assert.ok(out.ok);
      return out.lead.enquiryDate;
    };
    assert.equal(at("2026-11-20T10:15:00Z"), "2026-11-20");
    assert.equal(at("2026-02-31"), TODAY);
    assert.equal(at("2027-01-01"), TODAY);
    assert.equal(at("yesterday"), TODAY);
  });

  it("keeps a source the chatbot sends", () => {
    const out = parseInboundLead({ phone: "1", utm_source: "LinkedIn ad" }, TODAY);
    assert.ok(out.ok);
    assert.equal(out.lead.foundOn, "LinkedIn ad");
  });
});

describe("keyFromRequest", () => {
  const url = (q = "") => new URL(`https://crm.example/api/leads/inbound${q}`);

  it("reads a bearer token, an X-API-Key header, or ?key=", () => {
    assert.equal(keyFromRequest(new Headers({ authorization: "Bearer gdl_a" }), url()), "gdl_a");
    assert.equal(keyFromRequest(new Headers({ "x-api-key": "gdl_b" }), url()), "gdl_b");
    assert.equal(keyFromRequest(new Headers(), url("?key=gdl_c")), "gdl_c");
  });

  it("is null when there is no key", () => {
    assert.equal(keyFromRequest(new Headers(), url()), null);
  });
});
