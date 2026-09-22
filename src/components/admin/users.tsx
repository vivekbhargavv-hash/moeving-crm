"use client";

import { Check, Link2, MailCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PickerField,
  Sheet,
} from "@/components/ui";
import { deleteUser, resendInvite, setUserActive, upsertUser } from "@/server/actions";

const ROLE_LABEL: Record<Row["role"], string> = {
  admin: "Admin",
  sales: "Deal Owner",
  ops: "Operations",
};

const ROLE_STYLE: Record<Row["role"], string> = {
  admin: "bg-violet-100 text-violet-800",
  sales: "bg-slate-100 text-slate-700",
  ops: "bg-teal-100 text-teal-800",
};

type Row = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "sales" | "ops";
  isActive: boolean;
  linked: boolean;
  invitedAt: Date | null;
  /** "2 hours ago" / "22 Sep 2026", already worked out on the server. */
  lastSeen: string | null;
  lastSeenExact: string | null;
  /** Clerk's accept link, kept because the email often does not arrive. */
  inviteUrl: string | null;
  /** Deals they own. A user who owns any cannot be deleted, only suspended. */
  dealCount: number;
};

export function AdminUsers({
  users,
  currentUserId,
}: {
  users: Row[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Row | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [copied, setCopied] = React.useState<string | null>(null);

  /**
   * Handing the sign-up link over directly.
   *
   * Clerk accepts the invitation and reports success, but on a development
   * instance the email is sent from a shared Clerk domain that corporate mail
   * routinely rejects — so the person never sees it. This is the way round
   * that: copy the link, send it however you actually reach them.
   */
  async function copyInvite(u: Row) {
    if (!u.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(u.inviteUrl);
    } catch {
      // Clipboard is blocked outside a secure context or without permission;
      // a prompt still lets them copy it by hand rather than dead-ending.
      window.prompt(`Sign-up link for ${u.name}`, u.inviteUrl);
      return;
    }
    setCopied(u.id);
    setTimeout(() => setCopied((c) => (c === u.id ? null : c)), 2000);
  }

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertUser(formData);
      if (!result.ok) return setError(result.error);
      setEditing(null);
      setNotice(
        result.data?.inviteWarning ??
          (result.data?.invited ? "Saved. Invitation email sent." : null),
      );
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error ?? "Something went wrong");
      setConfirmDelete(null);
      if (done) setNotice(done);
      router.refresh();
    });
  }

  const current = editing === "new" ? null : editing;

  return (
    <>
      <Button className="mb-3 w-full sm:w-auto" onClick={() => setEditing("new")}>
        Add user
      </Button>

      {notice ? (
        <p className="mb-3 rounded-xl bg-brand-soft px-4 py-2.5 text-sm text-brand-ink">
          {notice}
        </p>
      ) : null}
      {error && editing === null && !confirmDelete ? (
        <p className="mb-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <Card className="divide-y divide-line">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          return (
            <div key={u.id} className="flex items-center gap-1 px-2 py-1 sm:px-3">
              <button
                onClick={() => setEditing(u)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-canvas"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {u.name}
                    {isSelf ? (
                      <span className="ml-1.5 text-[12px] font-normal text-muted">
                        (you)
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[13px] text-muted">{u.email}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {!u.isActive ? (
                    <Badge className="bg-slate-200 text-slate-700">Suspended</Badge>
                  ) : !u.linked ? (
                    <Badge className="bg-amber-100 text-amber-900">
                      {u.invitedAt ? "Invited" : "Not invited"}
                    </Badge>
                  ) : (
                    /* Signed in at least once. The date says whether they are
                       actually using it or accepted the invite and vanished. */
                    <Badge
                      className="bg-emerald-50 text-emerald-800"
                      title={u.lastSeenExact ?? undefined}
                    >
                      {u.lastSeen ? `Seen ${u.lastSeen}` : "Signed in"}
                    </Badge>
                  )}
                  <Badge className={ROLE_STYLE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                </div>
              </button>

              {/* The link is the reliable path; the email is best effort. */}
              {!u.linked && u.isActive && u.inviteUrl ? (
                <button
                  onClick={() => copyInvite(u)}
                  title="Copy their sign-up link"
                  aria-label={`Copy sign-up link for ${u.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas"
                >
                  {copied === u.id ? (
                    <Check size={17} className="text-emerald-600" />
                  ) : (
                    <Link2 size={17} />
                  )}
                </button>
              ) : null}

              {/* Re-send is only meaningful for somebody who has not signed in. */}
              {!u.linked && u.isActive ? (
                <button
                  onClick={() => run(() => resendInvite(u.id), "Invitation email sent.")}
                  disabled={pending}
                  title="Send the invitation email again"
                  aria-label={`Resend invitation to ${u.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas disabled:opacity-40"
                >
                  <MailCheck size={17} />
                </button>
              ) : null}

              {/* An admin cannot lock themselves out of their own Admin. */}
              {!isSelf ? (
                <button
                  onClick={() => run(() => setUserActive(u.id, !u.isActive))}
                  disabled={pending}
                  className="h-11 shrink-0 rounded-lg px-2.5 text-[13px] font-semibold text-muted hover:bg-canvas disabled:opacity-40"
                >
                  {u.isActive ? "Suspend" : "Restore"}
                </button>
              ) : null}

              {/* Deleting is for a row that owns nothing; everyone else keeps
                  their name on the deals they closed. */}
              {!isSelf && u.dealCount === 0 ? (
                <button
                  onClick={() => setConfirmDelete(u)}
                  disabled={pending}
                  aria-label={`Delete ${u.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                >
                  <Trash2 size={17} />
                </button>
              ) : null}
            </div>
          );
        })}
      </Card>

      <p className="mt-3 px-1 text-[13px] text-muted">
        Suspending blocks sign-in and takes someone out of the Deal Owner
        dropdowns, while their name stays on the deals they closed. Deleting is
        only offered for someone who owns no deals.
        <br />
        If someone says the invitation email never arrived, use the link button
        to copy their sign-up link and send it to them directly — it is the same
        link the email contains.
      </p>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? "Edit user" : "Add user"}
      >
        <form action={save} className="space-y-4">
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <Field label="Name">
            <Input name="name" required defaultValue={current?.name ?? ""} />
          </Field>
          <Field
            label="Work email"
            hint={
              current?.linked
                ? "They have already signed in with this address."
                : "We email them a sign-up link as soon as you save."
            }
          >
            <Input
              name="email"
              type="email"
              required
              defaultValue={current?.email ?? ""}
            />
          </Field>
          <Field
            label="Role"
            hint="Operations sees only the Deployments page — no pipeline, no pricing."
          >
            <PickerField
              label="Role"
              name="role"
              defaultValue={current?.role ?? "sales"}
              options={[
                { value: "sales", label: "Deal Owner" },
                { value: "ops", label: "Operations" },
                { value: "admin", label: "Admin" },
              ]}
            />
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={current?.isActive ?? true}
              className="h-5 w-5 rounded border-line"
            />
            Active — can sign in and own deals
          </label>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <Button variant="brand" size="lg" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete user"
      >
        <p className="text-sm">
          Permanently remove <strong>{confirmDelete?.name}</strong> (
          {confirmDelete?.email})? They own no deals, so nothing else changes.
          This cannot be undone.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => setConfirmDelete(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 bg-rose-600 text-white hover:bg-rose-700"
            disabled={pending}
            onClick={() =>
              confirmDelete &&
              run(() => deleteUser(confirmDelete.id), `${confirmDelete.name} deleted.`)
            }
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
