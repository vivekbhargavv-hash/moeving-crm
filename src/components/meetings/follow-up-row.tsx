"use client";

import { Check, Undo2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button, Sheet, Textarea } from "@/components/ui";
import { whileBusy } from "@/lib/busy";
import { dueLabel, LEVEL_LABEL } from "@/lib/meetings";
import { meetingId } from "@/lib/record-ids";
import { showToast } from "@/lib/toast";
import { cn, formatDateCompact } from "@/lib/utils";
import { closeFollowUp, reopenFollowUp } from "@/server/meeting-actions";

export type FollowUpItem = {
  id: string;
  description: string;
  dueOn: string;
  status: "open" | "done" | "dropped";
  side: "us" | "customer";
  ownerName: string;
  closedNote?: string | null;
  closedByName?: string | null;
  /** Set on the chase list, where a row has to say which account it is from. */
  accountId?: string;
  accountName?: string;
  meetingRef?: number;
  meetingLevel?: keyof typeof LEVEL_LABEL;
};

/**
 * One commitment, with the tap that closes it.
 *
 * The same row serves the chase list and the thread: in the thread the
 * account is already the page, so those details are left off rather than
 * repeated down the screen.
 */
export function FollowUpRow({
  item,
  today,
  showSource = false,
}: {
  item: FollowUpItem;
  today: string;
  showSource?: boolean;
}) {
  const [dropping, setDropping] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const open = item.status === "open";
  const late = open && item.dueOn < today;

  function close(status: "done" | "dropped") {
    if (status === "dropped" && !note.trim()) {
      return setError("Say why it is being dropped.");
    }
    setError(null);
    startTransition(async () => {
      const result = await whileBusy(
        closeFollowUp(item.id, { status, note: note.trim() || null }),
      );
      if (!result.ok) return setError(result.error);
      showToast(status === "done" ? "Follow-up closed" : "Follow-up dropped");
      setDropping(false);
      setNote("");
    });
  }

  function reopen() {
    startTransition(async () => {
      const result = await whileBusy(reopenFollowUp(item.id));
      if (!result.ok) return setError(result.error);
      showToast("Follow-up reopened");
    });
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-3 py-2.5",
        late ? "border-rose-200 bg-rose-50/70" : "border-line bg-canvas/70",
        !open && "bg-white",
      )}
    >
      <button
        type="button"
        onClick={() => (open ? close("done") : reopen())}
        disabled={pending}
        aria-label={open ? `Mark done: ${item.description}` : `Reopen: ${item.description}`}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition disabled:opacity-50",
          item.status === "done"
            ? "border-brand bg-brand text-white"
            : item.status === "dropped"
              ? "border-muted bg-muted/20 text-muted"
              : "border-muted text-transparent hover:border-brand hover:text-brand/40",
        )}
      >
        {item.status === "dropped" ? (
          <Undo2 size={12} aria-hidden="true" />
        ) : (
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[13.5px]",
            !open && "text-muted line-through decoration-muted/50",
          )}
        >
          {item.description}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
          {showSource && item.accountId ? (
            <>
              <Link
                href={`/meetings/${item.accountId}`}
                className="font-medium text-ink underline-offset-2 hover:underline"
              >
                {item.accountName}
              </Link>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>
            {item.side === "us" ? item.ownerName : `${item.ownerName} (customer)`}
          </span>
          <span aria-hidden="true">·</span>
          <span className={cn(late && "font-semibold text-rose-700")}>
            {formatDateCompact(item.dueOn)}
            {open ? ` · ${dueLabel(item.dueOn, today)}` : ""}
          </span>
          {showSource && item.meetingRef ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                from {meetingId(item.meetingRef)}
                {item.meetingLevel ? `, ${LEVEL_LABEL[item.meetingLevel]}` : ""}
              </span>
            </>
          ) : null}
        </p>
        {item.status === "dropped" && item.closedNote ? (
          <p className="mt-1 text-[12px] text-muted">Dropped: {item.closedNote}</p>
        ) : null}
        {item.status === "done" && item.closedByName ? (
          <p className="mt-1 text-[12px] text-muted">Closed by {item.closedByName}</p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-1 text-[12px] font-medium text-rose-700">
            {error}
          </p>
        ) : null}
      </div>

      {open ? (
        <button
          type="button"
          onClick={() => setDropping(true)}
          disabled={pending}
          className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-muted hover:bg-white hover:text-ink disabled:opacity-50"
        >
          Drop
        </button>
      ) : null}

      <Sheet
        open={dropping}
        onClose={() => setDropping(false)}
        title="Drop this follow-up"
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => setDropping(false)}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={pending}
              onClick={() => close("dropped")}
            >
              {pending ? "Dropping…" : "Drop it"}
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-muted">
          <strong className="text-ink">{item.description}</strong>
        </p>
        <Textarea
          rows={3}
          maxLength={500}
          autoFocus
          placeholder="Why it is not happening — e.g. customer deferred Pune to Q2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="mt-2 text-xs text-muted">
          A dropped follow-up has to say why, so the next person reading the
          thread is not left guessing.
        </p>
      </Sheet>
    </div>
  );
}
