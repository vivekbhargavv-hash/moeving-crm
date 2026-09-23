import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  awaitsMe,
  canActOn,
  canAssign,
  takesOnAction,
  type AssignableLead,
  type Viewer,
} from "@/lib/lead-assignment";

/**
 * Who may assign, take and act on a lead. The rules are Vivek's: only an
 * admin assigns, a deal owner takes an open unassigned lead by acting on it,
 * and an assigned lead is its assignee's and the admins' alone.
 */
const admin: Viewer = { userId: "a", role: "admin" };
const rahul: Viewer = { userId: "r", role: "sales" };
const priya: Viewer = { userId: "p", role: "sales" };
const desk: Viewer = { userId: "n", role: "noc" };
const ops: Viewer = { userId: "o", role: "ops" };

function lead(over: Partial<AssignableLead> = {}): AssignableLead {
  return { status: "new", assignedToUserId: null, ...over };
}

describe("canAssign", () => {
  it("is an admin's alone", () => {
    assert.equal(canAssign(admin, lead()), true);
    assert.equal(canAssign(rahul, lead()), false);
    assert.equal(canAssign(desk, lead()), false);
    assert.equal(canAssign(ops, lead()), false);
  });

  it("covers qualified leads not yet a deal, and nothing closed", () => {
    assert.equal(canAssign(admin, lead({ status: "qualified" })), true);
    assert.equal(canAssign(admin, lead({ status: "not_qualified" })), false);
    assert.equal(canAssign(admin, lead({ status: "converted" })), false);
  });
});

describe("canActOn", () => {
  it("keeps an assigned lead to its assignee and admins", () => {
    const priyas = lead({ assignedToUserId: "p" });
    assert.equal(canActOn(priya, priyas), true);
    assert.equal(canActOn(admin, priyas), true);
    assert.equal(canActOn(rahul, priyas), false);
  });

  it("lets any deal owner act on an unassigned lead", () => {
    assert.equal(canActOn(rahul, lead()), true);
    assert.equal(canActOn(priya, lead()), true);
  });

  it("never lets the desk or ops act, and nobody acts on a converted lead", () => {
    assert.equal(canActOn(desk, lead()), false);
    assert.equal(canActOn(ops, lead()), false);
    assert.equal(canActOn(admin, lead({ status: "converted" })), false);
  });
});

describe("takesOnAction", () => {
  it("makes an unassigned lead the deal owner's when they act on it", () => {
    assert.equal(takesOnAction(rahul, lead()), true);
    assert.equal(takesOnAction(rahul, lead({ assignedToUserId: "r" })), false);
  });

  it("does not hand the lead to an admin who is tidying", () => {
    assert.equal(takesOnAction(admin, lead()), false);
  });
});

describe("awaitsMe", () => {
  it("counts only my leads that nobody has rung yet", () => {
    assert.equal(awaitsMe(rahul, lead({ assignedToUserId: "r" })), true);
    assert.equal(
      awaitsMe(rahul, lead({ assignedToUserId: "r", status: "qualified" })),
      false,
    );
    assert.equal(awaitsMe(rahul, lead({ assignedToUserId: "p" })), false);
    assert.equal(awaitsMe(rahul, lead()), false);
  });
});
