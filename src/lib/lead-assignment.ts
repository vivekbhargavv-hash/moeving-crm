/**
 * Who a lead belongs to, and who may do what with it.
 *
 * Vivek's rules (23 Sep 2026):
 *  - Only an admin assigns a lead to somebody.
 *  - A deal owner takes an OPEN lead nobody has yet by acting on it —
 *    qualifying or rejecting it makes it theirs. There is no separate Take.
 *  - Once a lead is someone's, only they and admins act on it.
 *
 * Free of React, Next and the database, so the rules are tested directly and
 * the server actions and the screen cannot disagree about them.
 */

export type Role = "admin" | "sales" | "ops" | "noc";

export type Viewer = { userId: string; role: Role };

export type AssignableLead = {
  status: "new" | "qualified" | "not_qualified" | "converted";
  assignedToUserId: string | null;
};

/** Still waiting on somebody: not yet rung, or qualified but not a deal. */
export function isOpenLead(lead: Pick<AssignableLead, "status">) {
  return lead.status === "new" || lead.status === "qualified";
}

/** The people who ring leads back. */
export function isDealOwnerRole(role: Role) {
  return role === "admin" || role === "sales";
}

/** Assigning is an admin's call, and only while the lead is still open. */
export function canAssign(viewer: Viewer, lead: AssignableLead) {
  return viewer.role === "admin" && isOpenLead(lead);
}

/**
 * Qualify, reject, add a remark or convert.
 *
 * Admins always may. A deal owner may if the lead is theirs, or nobody's yet
 * — acting on an unassigned lead is picking it up (see `takesOnAction`).
 * A converted lead is worked in the pipeline, not here.
 */
export function canActOn(viewer: Viewer, lead: AssignableLead) {
  if (lead.status === "converted") return false;
  if (viewer.role === "admin") return true;
  if (viewer.role !== "sales") return false;
  return lead.assignedToUserId === null || lead.assignedToUserId === viewer.userId;
}

/**
 * Whether acting on this lead should also make it the actor's.
 *
 * A deal owner who rings an unassigned lead has picked it up, so it becomes
 * theirs. An admin acting on one does not claim it — they are usually
 * tidying, not taking the call on.
 */
export function takesOnAction(viewer: Viewer, lead: AssignableLead) {
  return viewer.role === "sales" && lead.assignedToUserId === null;
}

/** Assigned to me and not rung yet — what the badge on the Leads tab counts. */
export function awaitsMe(viewer: Viewer, lead: AssignableLead) {
  return lead.assignedToUserId === viewer.userId && lead.status === "new";
}
