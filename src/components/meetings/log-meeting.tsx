"use client";

import { Plus, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
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
import type { MeetingKind, MeetingLevel } from "@/db/schema";
import { whileBusy } from "@/lib/busy";
import { STAGE_MAP } from "@/lib/constants";
import { MEETING_KINDS, MEETING_LEVELS } from "@/lib/meetings";
import { meetingId } from "@/lib/record-ids";
import { showToast } from "@/lib/toast";
import { cn, formatDateCompact } from "@/lib/utils";
import { createContact, createMeeting, fetchAccountExtras } from "@/server/meeting-actions";

type Option = { id: string; name: string };
type Contact = { id: string; name: string; designation: string | null };
type Deal = { id: string; name: string; stage: keyof typeof STAGE_MAP };
type Parent = { id: string; ref: number; title: string; metOn: string; level: MeetingLevel };

type DraftFollowUp = {
  key: number;
  description: string;
  /** "u:<id>" for one of ours, "c:<id>" for someone at the customer. */
  owner: string;
  dueOn: string;
};

/**
 * Logging a meeting, in two steps — and the second step is the point.
 *
 * Notes on their own make a diary nobody reads. Asking "what did we commit
 * to?" at the moment of saving is what keeps the board true the next morning,
 * so it is a step of its own rather than a field at the bottom somebody
 * scrolls past.
 *
 * Only the customer, the date, the level, a title and what was discussed are
 * required: a meeting has to be loggable in a minute, in the car, and filled
 * out properly later.
 */
export function LogMeeting({
  accounts,
  users,
  topics,
  cities,
  today,
  me,
  isAdmin,
  accountId,
  extras,
  label = "Log a meeting",
}: {
  accounts: { id: string; name: string; isStrategic: boolean }[];
  users: Option[];
  topics: { id: string; label: string }[];
  cities: Option[];
  today: string;
  me: Option;
  isAdmin: boolean;
  /** Set when opened from one customer's page — the picker is then fixed. */
  accountId?: string;
  extras?: { contacts: Contact[]; deals: Deal[]; parents: Parent[] };
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<1 | 2>(1);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [account, setAccount] = React.useState(accountId ?? "");
  const [metOn, setMetOn] = React.useState(today);
  const [kind, setKind] = React.useState<MeetingKind>("in_person");
  const [level, setLevel] = React.useState<MeetingLevel>("leadership");
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [parent, setParent] = React.useState("");
  const [city, setCity] = React.useState("");
  const [deal, setDeal] = React.useState("");
  const [owner, setOwner] = React.useState(me.id);
  const [confidential, setConfidential] = React.useState(false);
  const [ourSide, setOurSide] = React.useState<string[]>([]);
  const [theirSide, setTheirSide] = React.useState<string[]>([]);
  const [chosenTopics, setChosenTopics] = React.useState<string[]>([]);

  const [followUps, setFollowUps] = React.useState<DraftFollowUp[]>([]);
  const [planNext, setPlanNext] = React.useState(false);
  const [nextOn, setNextOn] = React.useState("");
  const [nextTitle, setNextTitle] = React.useState("");
  const [nextKind, setNextKind] = React.useState<MeetingKind>("video");
  const [nextOwner, setNextOwner] = React.useState(me.id);

  const [loaded, setLoaded] = React.useState(extras ?? { contacts: [], deals: [], parents: [] });
  const [loadingExtras, setLoadingExtras] = React.useState(false);
  const [newContact, setNewContact] = React.useState(false);

  /** A date in the future is a meeting being planned, not one being written up. */
  const planning = metOn > today;

  // The contacts, deals and earlier meetings belong to the customer, so they
  // are fetched when one is chosen rather than shipped for all of them.
  React.useEffect(() => {
    if (!open || !account) return;
    if (extras && account === accountId) return setLoaded(extras);
    let live = true;
    setLoadingExtras(true);
    fetchAccountExtras(account)
      .then((result) => {
        if (!live) return;
        if (result.ok && result.data) setLoaded(result.data);
      })
      .catch(() => {
        /* The sheet still works; the lists are simply empty. */
      })
      .finally(() => live && setLoadingExtras(false));
    return () => {
      live = false;
    };
  }, [open, account, accountId, extras]);

  function reset() {
    setStep(1);
    setError(null);
    setAccount(accountId ?? "");
    setMetOn(today);
    setKind("in_person");
    setLevel("leadership");
    setTitle("");
    setNotes("");
    setParent("");
    setCity("");
    setDeal("");
    setOwner(me.id);
    setConfidential(false);
    setOurSide([]);
    setTheirSide([]);
    setChosenTopics([]);
    setFollowUps([]);
    setPlanNext(false);
    setNextOn("");
    setNextTitle("");
    setNextOwner(me.id);
  }

  function next() {
    if (!account) return setError("Choose the customer.");
    if (!metOn) return setError("Give the meeting a date.");
    if (title.trim().length < 3) return setError("Give the meeting a one-line title.");
    if (!planning && notes.trim().length === 0) {
      return setError("Write down what was discussed.");
    }
    setError(null);
    setStep(2);
  }

  function save() {
    setError(null);
    for (const f of followUps) {
      if (!f.description.trim()) return setError("Every follow-up needs a sentence.");
      if (!f.owner) return setError("Every follow-up needs an owner.");
      if (!f.dueOn) return setError("Every follow-up needs a date.");
    }
    if (planNext && (!nextOn || nextTitle.trim().length < 3)) {
      return setError("The next meeting needs a date and a title.");
    }

    startTransition(async () => {
      const result = await whileBusy(
        createMeeting({
          accountId: account,
          level,
          kind,
          metOn,
          title: title.trim(),
          agenda: planning ? notes.trim() || null : null,
          notes: planning ? null : notes.trim(),
          confidential,
          ownerUserId: owner,
          opportunityId: deal || null,
          cityId: city || null,
          parentMeetingId: parent || null,
          attendeeUserIds: ourSide,
          attendeeContactIds: theirSide,
          topicIds: chosenTopics,
          followUps: followUps.map((f) => ({
            description: f.description.trim(),
            ownerUserId: f.owner.startsWith("u:") ? f.owner.slice(2) : null,
            ownerContactId: f.owner.startsWith("c:") ? f.owner.slice(2) : null,
            dueOn: f.dueOn,
          })),
          nextMeeting: planNext
            ? {
                metOn: nextOn,
                kind: nextKind,
                title: nextTitle.trim(),
                ownerUserId: nextOwner,
                level,
              }
            : null,
        }),
      );
      if (!result.ok) return setError(result.error);
      showToast(
        result.data ? `Meeting ${meetingId(result.data.ref)} logged` : "Meeting logged",
      );
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  const ownerOptions = [
    ...users.map((u) => ({ value: `u:${u.id}`, label: u.name })),
    ...loaded.contacts.map((c) => ({
      value: `c:${c.id}`,
      label: `${c.name}${c.designation ? `, ${c.designation}` : ""} (customer)`,
    })),
  ];

  const dirty = Boolean(title || notes || followUps.length);
  const accountName = accounts.find((a) => a.id === account)?.name;

  return (
    <>
      <Button
        type="button"
        variant="brand"
        size="sm"
        className="h-10 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Plus size={15} />
        {label}
      </Button>

      <Sheet
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={step === 1 ? (planning ? "Plan a meeting" : "Log a meeting") : "Follow-ups"}
        confirmDiscard={dirty}
        footer={
          step === 1 ? (
            <Button
              type="button"
              variant="brand"
              size="lg"
              className="w-full"
              onClick={next}
            >
              Next — follow-ups
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-24"
                disabled={pending}
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="brand"
                size="lg"
                className="flex-1"
                disabled={pending}
                onClick={save}
              >
                {pending ? "Saving…" : "Save meeting"}
              </Button>
            </div>
          )
        }
      >
        <p className="-mt-1 mb-4 text-[12px] font-semibold uppercase tracking-wide text-muted">
          Step {step} of 2
        </p>

        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                Customer
              </p>
              {accountId ? (
                <p className="rounded-xl border border-line bg-canvas px-3.5 py-3 text-[15px] font-medium">
                  {accountName}
                </p>
              ) : (
                <Picker
                  label="Customer"
                  value={account}
                  onChange={(v) => {
                    setAccount(v);
                    setParent("");
                    setDeal("");
                    setTheirSide([]);
                  }}
                  options={accounts.map((a) => ({
                    value: a.id,
                    label: a.isStrategic ? `${a.name} ★` : a.name,
                  }))}
                  placeholder="Choose a customer"
                  className="h-12 w-full rounded-xl px-3.5 text-[15px]"
                />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date">
                <Input
                  type="date"
                  value={metOn}
                  onChange={(e) => setMetOn(e.target.value)}
                />
                <PickedDate value={metOn} />
              </Field>
              <div>
                <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                  Format
                </p>
                <Segmented
                  label="Format"
                  value={kind}
                  onChange={setKind}
                  options={MEETING_KINDS.map((k) => ({ value: k.value, label: k.label }))}
                />
              </div>
            </div>

            {planning ? (
              <p className="rounded-lg bg-sky-50 px-3 py-2 text-[12.5px] text-sky-900">
                That date is in the future, so this is saved as a{" "}
                <strong>planned</strong> meeting. Write it up afterwards and it
                counts as held.
              </p>
            ) : null}

            <div>
              <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                Level
              </p>
              <Segmented
                label="Level"
                value={level}
                onChange={setLevel}
                options={MEETING_LEVELS.map((l) => ({ value: l.value, label: l.label }))}
              />
              <p className="mt-1 text-xs text-muted">
                {MEETING_LEVELS.find((l) => l.value === level)?.hint}
              </p>
            </div>

            <Field label="Title" hint="One line somebody can scan in a thread.">
              <Input
                maxLength={140}
                placeholder="e.g. Annual review and the Pune expansion ask"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            <div>
              <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                Follow-up to
              </p>
              <Picker
                label="Earlier meeting this follows"
                value={parent}
                onChange={setParent}
                options={[
                  { value: "", label: "Not a follow-up — new conversation" },
                  ...loaded.parents.map((p) => ({
                    value: p.id,
                    label: `${meetingId(p.ref)} · ${formatDateCompact(p.metOn)} · ${p.title}`,
                  })),
                ]}
                placeholder={
                  loadingExtras ? "Loading…" : "Not a follow-up — new conversation"
                }
                className="h-12 w-full rounded-xl px-3.5 text-[15px]"
              />
              <p className="mt-1 text-xs text-muted">
                Point a regional follow-up at the leadership meeting it came out
                of, and the thread reads top to bottom.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                Who was there — our side
              </p>
              <Chips
                options={users
                  .filter((u) => u.id !== owner)
                  .map((u) => ({ value: u.id, label: u.name }))}
                chosen={ourSide}
                onChange={setOurSide}
              />
              <p className="mt-1 text-xs text-muted">
                {users.find((u) => u.id === owner)?.name ?? "The meeting owner"} is
                counted already.
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[13px] font-medium tracking-tight text-muted">
                  Who was there — their side
                </p>
                <button
                  type="button"
                  disabled={!account}
                  onClick={() => setNewContact(true)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-brand-ink hover:bg-brand-soft disabled:opacity-40"
                >
                  <UserPlus size={13} />
                  New contact
                </button>
              </div>
              {loaded.contacts.length === 0 ? (
                <p className="text-[13px] text-muted">
                  {account
                    ? "Nobody on file for this customer yet. Add the people who were in the room."
                    : "Choose the customer first."}
                </p>
              ) : (
                <Chips
                  options={loaded.contacts.map((c) => ({
                    value: c.id,
                    label: c.designation ? `${c.name}, ${c.designation}` : c.name,
                  }))}
                  chosen={theirSide}
                  onChange={setTheirSide}
                />
              )}
            </div>

            <Field label={planning ? "Agenda" : "What was discussed"}>
              <Textarea
                rows={5}
                maxLength={8000}
                placeholder={
                  planning
                    ? "What this meeting is for"
                    : "Happy with Mumbai uptime. Wants 12 × 4W in Pune from February but pushed on rate…"
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            {topics.length ? (
              <div>
                <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                  Topics
                </p>
                <Chips
                  options={topics.map((t) => ({ value: t.id, label: t.label }))}
                  chosen={chosenTopics}
                  onChange={setChosenTopics}
                />
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                  City
                </p>
                <Picker
                  label="City"
                  value={city}
                  onChange={setCity}
                  options={[
                    { value: "", label: "Not city-specific" },
                    ...cities.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  placeholder="Not city-specific"
                  className="h-12 w-full rounded-xl px-3.5 text-[15px]"
                />
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                  Deal it concerned
                </p>
                <Picker
                  label="Deal it concerned"
                  value={deal}
                  onChange={setDeal}
                  options={[
                    { value: "", label: "No particular deal" },
                    ...loaded.deals.map((d) => ({
                      value: d.id,
                      label: `${d.name} · ${STAGE_MAP[d.stage].short}`,
                    })),
                  ]}
                  placeholder="No particular deal"
                  className="h-12 w-full rounded-xl px-3.5 text-[15px]"
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                Whose meeting it is
              </p>
              <Picker
                label="Meeting owner"
                value={owner}
                onChange={setOwner}
                options={users.map((u) => ({ value: u.id, label: u.name }))}
                className="h-12 w-full rounded-xl px-3.5 text-[15px]"
              />
              <p className="mt-1 text-xs text-muted">
                {owner === me.id
                  ? "Change this when you are writing up somebody else's meeting."
                  : `Logged by ${me.name} on behalf of ${
                      users.find((u) => u.id === owner)?.name ?? "them"
                    }.`}
              </p>
            </div>

            {isAdmin ? (
              <label className="flex items-start gap-3 rounded-xl border border-line bg-canvas px-3 py-3">
                <input
                  type="checkbox"
                  checked={confidential}
                  onChange={(e) => setConfidential(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                />
                <span>
                  <span className="block text-[14px] font-semibold">Confidential</span>
                  <span className="block text-[12px] text-muted">
                    Admins only. Deal owners cannot read it, so they cannot
                    follow it up either — leave it off unless it has to be.
                  </span>
                </span>
              </label>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              What did we commit to? Each one gets an owner and a date, and
              whoever owns it gets a notification.
            </p>

            {followUps.map((f, i) => (
              <div
                key={f.key}
                className="space-y-3 rounded-xl border border-line bg-canvas/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                    Follow-up {i + 1}
                  </p>
                  <button
                    type="button"
                    aria-label={`Remove follow-up ${i + 1}`}
                    onClick={() =>
                      setFollowUps((list) => list.filter((x) => x.key !== f.key))
                    }
                    className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-rose-700"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <Textarea
                  rows={2}
                  maxLength={500}
                  placeholder="e.g. Send the Pune proposal, 12 × 4W at 30 operating days"
                  value={f.description}
                  onChange={(e) =>
                    setFollowUps((list) =>
                      list.map((x) =>
                        x.key === f.key ? { ...x, description: e.target.value } : x,
                      ),
                    )
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Picker
                    label={`Owner of follow-up ${i + 1}`}
                    value={f.owner}
                    onChange={(owner) =>
                      setFollowUps((list) =>
                        list.map((x) => (x.key === f.key ? { ...x, owner } : x)),
                      )
                    }
                    options={ownerOptions}
                    placeholder="Owner"
                    className="h-12 w-full rounded-xl px-3.5 text-[15px]"
                  />
                  <div>
                    <Input
                      type="date"
                      aria-label={`Due date of follow-up ${i + 1}`}
                      value={f.dueOn}
                      onChange={(e) =>
                        setFollowUps((list) =>
                          list.map((x) =>
                            x.key === f.key ? { ...x, dueOn: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <PickedDate value={f.dueOn} />
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="secondary"
              size="md"
              className="w-full gap-1.5"
              onClick={() =>
                setFollowUps((list) => [
                  ...list,
                  { key: Date.now() + list.length, description: "", owner: "", dueOn: "" },
                ])
              }
            >
              <Plus size={15} />
              {followUps.length ? "Another follow-up" : "Add a follow-up"}
            </Button>

            <div className="h-px bg-line" />

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={planNext}
                onChange={(e) => setPlanNext(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-brand"
              />
              <span className="text-[14px] font-semibold">
                A next meeting is already agreed
              </span>
            </label>

            {planNext ? (
              <div className="space-y-3 rounded-xl border border-line bg-canvas/60 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Date">
                    <Input
                      type="date"
                      min={today}
                      value={nextOn}
                      onChange={(e) => setNextOn(e.target.value)}
                    />
                    <PickedDate value={nextOn} />
                  </Field>
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                      Format
                    </p>
                    <Segmented
                      label="Next meeting format"
                      value={nextKind}
                      onChange={setNextKind}
                      options={MEETING_KINDS.map((k) => ({
                        value: k.value,
                        label: k.label,
                      }))}
                    />
                  </div>
                </div>
                <Field label="What it is for">
                  <Input
                    maxLength={140}
                    placeholder="e.g. CEO call — rate and the Pune go-ahead"
                    value={nextTitle}
                    onChange={(e) => setNextTitle(e.target.value)}
                  />
                </Field>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium tracking-tight text-muted">
                    Who leads it
                  </p>
                  <Picker
                    label="Owner of the next meeting"
                    value={nextOwner}
                    onChange={setNextOwner}
                    options={users.map((u) => ({ value: u.id, label: u.name }))}
                    className="h-12 w-full rounded-xl px-3.5 text-[15px]"
                  />
                </div>
                <p className="text-xs text-muted">
                  It is saved as a planned meeting under this one, which is what
                  keeps the account off the stalled list.
                </p>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </Sheet>

      <NewContact
        open={newContact}
        accountId={account}
        onClose={() => setNewContact(false)}
        onCreated={(c) => {
          setLoaded((l) => ({ ...l, contacts: [...l.contacts, c] }));
          setTheirSide((t) => [...t, c.id]);
        }}
      />
    </>
  );
}

/** A multi-select that reads as a row of pills rather than a list box. */
function Chips({
  options,
  chosen,
  onChange,
}: {
  options: { value: string; label: string }[];
  chosen: string[];
  onChange: (next: string[]) => void;
}) {
  if (options.length === 0) {
    return <p className="text-[13px] text-muted">Nothing to choose from yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = chosen.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(on ? chosen.filter((c) => c !== o.value) : [...chosen, o.value])
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
              on
                ? "border-brand bg-brand-soft text-brand-ink"
                : "border-line bg-white text-muted hover:bg-canvas hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Adding someone at the customer's end without leaving the sheet. */
function NewContact({
  open,
  accountId,
  onClose,
  onCreated,
}: {
  open: boolean;
  accountId: string;
  onClose: () => void;
  onCreated: (contact: Contact) => void;
}) {
  const [name, setName] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [decisionMaker, setDecisionMaker] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function save() {
    if (name.trim().length < 2) return setError("Enter their name.");
    setError(null);
    startTransition(async () => {
      const result = await whileBusy(
        createContact({
          accountId,
          name: name.trim(),
          designation: designation.trim() || null,
          email: email.trim() || null,
          mobile: mobile.trim() || null,
          isDecisionMaker: decisionMaker,
        }),
      );
      if (!result.ok) return setError(result.error);
      if (result.data) onCreated(result.data);
      setName("");
      setDesignation("");
      setEmail("");
      setMobile("");
      setDecisionMaker(false);
      onClose();
    });
  }

  return (
    <Sheet
      open={open}
      onClose={() => (pending ? undefined : onClose())}
      title="New contact"
      confirmDiscard={Boolean(name)}
      footer={
        <Button
          type="button"
          variant="brand"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Add contact"}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input
            autoFocus
            maxLength={120}
            placeholder="e.g. Anand Krishnan"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Designation" hint="What makes a name worth recording.">
          <Input
            maxLength={120}
            placeholder="e.g. Chief Supply Chain Officer"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email (optional)">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Mobile (optional)">
            <Input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />
          </Field>
        </div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={decisionMaker}
            onChange={(e) => setDecisionMaker(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-brand"
          />
          <span className="text-[14px]">They can say yes</span>
        </label>
        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
