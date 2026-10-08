"use client";

import { upload } from "@vercel/blob/client";
import { ExternalLink, FileText, Pencil, Trash2, Upload } from "lucide-react";
import * as React from "react";

import {
  Button,
  Field,
  Input,
  PickedDate,
  Picker,
  Segmented,
  Sheet,
  Textarea,
} from "@/components/ui";
import type { AgreementType, SalesStage } from "@/db/schema";
import {
  AGREEMENT_ACCEPT,
  AGREEMENT_TYPES,
  AGREEMENT_TYPE_LABEL,
  daysUntil,
  fileProblem,
  renewalState,
  safeFileName,
} from "@/lib/agreements";
import { whileBusy } from "@/lib/busy";
import { STAGE_MAP } from "@/lib/constants";
import { showToast } from "@/lib/toast";
import { cn, formatDate } from "@/lib/utils";
import {
  createAgreement,
  deleteAgreement,
  updateAgreement,
} from "@/server/agreement-actions";
import type { AgreementRow } from "@/server/queries";

type Deal = { id: string; name: string; stage: SalesStage };

type Draft = {
  type: AgreementType;
  signedOn: string;
  renewalOn: string;
  opportunityId: string;
  notes: string;
};

const EMPTY: Draft = { type: "msa", signedOn: "", renewalOn: "", opportunityId: "", notes: "" };

/**
 * A customer's signed agreements, and the one place they are uploaded.
 *
 * The file goes from the phone straight to the private blob store (a server
 * function cannot take a body over 4.5 MB, and a scan is often bigger), then
 * the details are saved with `createAgreement`, which checks the file is
 * really there and really in this customer's folder.
 */
export function AgreementsPanel({
  accountId,
  accountName,
  folder,
  agreements,
  deals,
  today,
}: {
  accountId: string;
  accountName: string;
  /** `agreements/<org>/<customer>/` — where this customer's files go. */
  folder: string;
  agreements: AgreementRow[];
  deals: Deal[];
  today: string;
}) {
  /** null: closed. "new": uploading. Otherwise the agreement being edited. */
  const [editing, setEditing] = React.useState<"new" | AgreementRow | null>(null);
  const [deleting, setDeleting] = React.useState<AgreementRow | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const [file, setFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function openNew() {
    setDraft(EMPTY);
    setFile(null);
    setError(null);
    setProgress(null);
    setEditing("new");
  }

  function openEdit(a: AgreementRow) {
    setDraft({
      type: a.type,
      signedOn: a.signedOn,
      renewalOn: a.renewalOn ?? "",
      opportunityId: a.opportunityId ?? "",
      notes: a.notes ?? "",
    });
    setError(null);
    setEditing(a);
  }

  const details = () => ({
    type: draft.type,
    signedOn: draft.signedOn,
    renewalOn: draft.renewalOn || null,
    opportunityId: draft.opportunityId || null,
    notes: draft.notes || null,
  });

  function save() {
    setError(null);
    if (draft.renewalOn && draft.signedOn && draft.renewalOn < draft.signedOn) {
      return setError("The renewal date cannot be before it was signed.");
    }
    startTransition(async () => {
      try {
        if (editing === "new") {
          if (!file) return setError("Choose the signed file.");
          const problem = fileProblem(file);
          if (problem) return setError(problem);

          setProgress(0);
          const blob = await upload(`${folder}${safeFileName(file.name)}`, file, {
            access: "private",
            handleUploadUrl: "/api/agreements/upload",
            clientPayload: JSON.stringify({ accountId }),
            contentType: file.type || undefined,
            // Large scans go up in parts, so one dropped packet on 4G does
            // not cost the whole file.
            multipart: file.size > 8 * 1024 * 1024,
            onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
          });
          const result = await whileBusy(
            createAgreement({
              accountId,
              pathname: blob.pathname,
              fileName: file.name,
              ...details(),
            }),
          );
          if (!result.ok) return setError(result.error);
          showToast("Agreement uploaded");
        } else if (editing) {
          const result = await whileBusy(updateAgreement(editing.id, details()));
          if (!result.ok) return setError(result.error);
          showToast("Agreement updated");
        }
        setEditing(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        setError(
          /not set up/i.test(message)
            ? "File storage is not set up yet. Ask an admin to connect Vercel Blob."
            : message && message.length < 160
              ? message
              : "Could not upload that. Check your connection and try again.",
        );
      } finally {
        setProgress(null);
      }
    });
  }

  function remove() {
    if (!deleting) return;
    startTransition(async () => {
      try {
        const result = await whileBusy(deleteAgreement(deleting.id));
        if (!result.ok) return setError(result.error);
        showToast("Agreement deleted");
        setDeleting(null);
        setEditing(null);
      } catch {
        setError("Could not delete that. Check your connection and try again.");
      }
    });
  }

  const dealOptions = [
    { value: "", label: "All deals for this customer" },
    ...deals.map((d) => ({ value: d.id, label: `${d.name} · ${STAGE_MAP[d.stage].short}` })),
  ];

  return (
    <section className="rounded-[14px] border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          Agreements
        </h2>
        <Button variant="brand" size="sm" className="h-10 gap-1.5" onClick={openNew}>
          <Upload size={15} />
          Upload
        </Button>
      </div>

      {agreements.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">
          No signed agreement on file. Upload the MSA, an addendum or any other
          signed paper — a PDF, a photo of the pages, or the Word file.
        </p>
      ) : (
        <ul className="divide-y divide-line px-4 pb-1">
          {agreements.map((a) => (
            <AgreementItem key={a.id} a={a} today={today} onEdit={() => openEdit(a)} />
          ))}
        </ul>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => (pending ? undefined : setEditing(null))}
        title={editing === "new" ? "Upload agreement" : "Edit agreement"}
        action={save}
        confirmDiscard={editing === "new" && Boolean(file)}
        footer={
          <div className="flex gap-2">
            {editing && editing !== "new" ? (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                aria-label="Delete agreement"
                className="w-12 px-0 text-rose-700"
                disabled={pending}
                onClick={() => setDeleting(editing)}
              >
                <Trash2 size={18} />
              </Button>
            ) : null}
            <Button variant="brand" size="lg" className="flex-1" disabled={pending}>
              {progress !== null
                ? `Uploading… ${progress}%`
                : pending
                  ? "Saving…"
                  : editing === "new"
                    ? "Upload"
                    : "Save changes"}
            </Button>
          </div>
        }
      >
        <p className="-mt-1 mb-4 text-sm text-muted">
          For <strong>{accountName}</strong>
          {editing && editing !== "new" ? <> · {editing.fileName}</> : null}
        </p>
        <div className="space-y-4">
          {editing === "new" ? (
            <Field label="Signed file" hint="PDF, photo (JPG, PNG, HEIC) or Word, up to 25 MB.">
              <input
                type="file"
                required
                accept={AGREEMENT_ACCEPT}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setError(f ? fileProblem(f) : null);
                }}
                className="block w-full rounded-xl border border-dashed border-line bg-canvas/60 px-3 py-3 text-sm file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:font-semibold file:text-brand-ink"
              />
            </Field>
          ) : null}

          <div>
            <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">Type</p>
            <Segmented
              label="Agreement type"
              value={draft.type}
              onChange={(type) => setDraft((d) => ({ ...d, type }))}
              options={AGREEMENT_TYPES.map((t) => ({ value: t.value, label: t.short }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Signed on">
              <Input
                type="date"
                required
                max={today}
                value={draft.signedOn}
                onChange={(e) => setDraft((d) => ({ ...d, signedOn: e.target.value }))}
              />
              <PickedDate value={draft.signedOn} />
            </Field>
            <Field label="Renewal date (optional)">
              <Input
                type="date"
                min={draft.signedOn || undefined}
                value={draft.renewalOn}
                onChange={(e) => setDraft((d) => ({ ...d, renewalOn: e.target.value }))}
              />
              <PickedDate value={draft.renewalOn} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-muted">
            The Customers page lists it 60 days before renewal, until the
            renewed agreement is uploaded.
          </p>

          <div>
            <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">Covers</p>
            <Picker
              label="Which deal it covers"
              value={draft.opportunityId}
              onChange={(opportunityId) => setDraft((d) => ({ ...d, opportunityId }))}
              options={dealOptions}
              className="h-12 w-full rounded-xl px-3.5 text-[15px]"
            />
            <p className="mt-1 text-xs text-muted">
              Leave it on All deals for a master agreement. Pick a deal when this
              paper is for that deal only.
            </p>
          </div>

          <Field label="Note (optional)">
            <Textarea
              rows={2}
              maxLength={500}
              placeholder="e.g. Rate revision from 1 Nov"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </Field>

          {error ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this agreement"
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => setDeleting(null)}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={pending}
              onClick={remove}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        }
      >
        <p className="text-sm">
          Permanently delete <strong>{deleting?.fileName}</strong> from{" "}
          {accountName}? The file is removed from storage too, and cannot be
          brought back.
        </p>
      </Sheet>
    </section>
  );
}

function AgreementItem({
  a,
  today,
  onEdit,
}: {
  a: AgreementRow;
  today: string;
  onEdit: () => void;
}) {
  const state = renewalState(a.renewalOn, today);
  const days = a.renewalOn ? daysUntil(a.renewalOn, today) : 0;

  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
        <FileText size={17} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-700">
            {AGREEMENT_TYPE_LABEL[a.type]}
          </span>
          <span className="text-[12.5px] text-muted">
            {a.dealName ? a.dealName : "All deals"}
          </span>
        </div>
        <a
          href={`/api/agreements/${a.id}`}
          target="_blank"
          rel="noopener"
          className="mt-1 flex items-center gap-1 text-[14px] font-medium text-brand-ink underline-offset-2 hover:underline"
        >
          <span className="truncate">{a.fileName}</span>
          <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
        </a>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Signed {formatDate(a.signedOn)}
          {a.renewalOn ? (
            <>
              {" · "}
              <span
                className={cn(
                  state === "overdue" && "font-semibold text-rose-700",
                  state === "due" && "font-semibold text-amber-800",
                )}
              >
                renews {formatDate(a.renewalOn)}
                {state === "overdue"
                  ? ` (${-days} ${days === -1 ? "day" : "days"} late)`
                  : state === "due"
                    ? ` (in ${days} ${days === 1 ? "day" : "days"})`
                    : ""}
              </span>
            </>
          ) : null}
          {a.uploadedBy ? ` · by ${a.uploadedBy.split(" ")[0]}` : ""}
        </p>
        {a.notes ? <p className="mt-1 text-[13px]">{a.notes}</p> : null}
      </div>
      <button
        onClick={onEdit}
        aria-label={`Edit ${a.fileName}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-canvas hover:bg-canvas"
      >
        <Pencil size={16} />
      </button>
    </li>
  );
}
