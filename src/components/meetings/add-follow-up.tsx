"use client";

import { Plus } from "lucide-react";
import * as React from "react";

import { Button, Field, Input, PickedDate, Picker, Sheet, Textarea } from "@/components/ui";
import { whileBusy } from "@/lib/busy";
import { showToast } from "@/lib/toast";
import { addFollowUp } from "@/server/meeting-actions";

export type Person = { id: string; name: string; designation?: string | null };

/**
 * One more commitment on a meeting that already exists — the thread's "Add
 * follow-up", and the board's "Set next step" against an account that has
 * gone quiet.
 *
 * The owner list holds both sides of the room: our people own what we owe,
 * and a contact owns what the customer owes us. That is what lets the board
 * say "with customer" instead of making it look like we are late.
 */
export function AddFollowUp({
  meetingId,
  users,
  contacts,
  today,
  label = "Add follow-up",
  variant = "secondary",
  defaultOwnerUserId,
}: {
  meetingId: string;
  users: Person[];
  contacts: Person[];
  today: string;
  label?: string;
  variant?: "secondary" | "brand";
  defaultOwnerUserId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [owner, setOwner] = React.useState(
    defaultOwnerUserId ? `u:${defaultOwnerUserId}` : "",
  );
  const [dueOn, setDueOn] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const options = [
    ...users.map((u) => ({ value: `u:${u.id}`, label: u.name })),
    ...contacts.map((c) => ({
      value: `c:${c.id}`,
      label: `${c.name}${c.designation ? `, ${c.designation}` : ""} (customer)`,
    })),
  ];

  function save() {
    if (!description.trim()) return setError("Say what the follow-up is.");
    if (!owner) return setError("Choose who owns it.");
    if (!dueOn) return setError("Give it a date.");
    setError(null);
    startTransition(async () => {
      const result = await whileBusy(
        addFollowUp(meetingId, {
          description: description.trim(),
          ownerUserId: owner.startsWith("u:") ? owner.slice(2) : null,
          ownerContactId: owner.startsWith("c:") ? owner.slice(2) : null,
          dueOn,
        }),
      );
      if (!result.ok) return setError(result.error);
      showToast("Follow-up added");
      setDescription("");
      setDueOn("");
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Plus size={14} />
        {label}
      </Button>

      <Sheet
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={label}
        confirmDiscard={Boolean(description)}
        footer={
          <Button
            type="button"
            variant="brand"
            size="lg"
            className="w-full"
            disabled={pending}
            onClick={save}
          >
            {pending ? "Saving…" : "Add follow-up"}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="What has to happen">
            <Textarea
              rows={2}
              maxLength={500}
              autoFocus
              placeholder="e.g. Send the revised 4W rate card for 30-day operations"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div>
            <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
              Who owns it
            </p>
            <Picker
              label="Owner"
              value={owner}
              onChange={setOwner}
              options={options}
              placeholder="Choose a person"
              className="h-12 w-full rounded-xl px-3.5 text-[15px]"
            />
            <p className="mt-1 text-xs text-muted">
              Pick someone at the customer when the ball is on their side.
            </p>
          </div>

          <Field label="Due">
            <Input
              type="date"
              value={dueOn}
              min={today}
              onChange={(e) => setDueOn(e.target.value)}
            />
            <PickedDate value={dueOn} />
          </Field>

          {error ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
