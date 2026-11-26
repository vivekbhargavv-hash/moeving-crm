"use client";

import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Badge, Button, Card, CardHeader, Field, Input, Sheet } from "@/components/ui";
import { showToast } from "@/lib/toast";
import { formatDate, formatDateTimeInIndia, num } from "@/lib/utils";
import { createIntakeKey, revokeIntakeKey } from "@/server/intake-actions";

type Key = {
  id: string;
  label: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  leadsReceived: number;
  revokedAt: Date | null;
};

/** The smallest lead worth sending, shown so a developer can copy it. */
const EXAMPLE = `{
  "name": "Ravi Kumar",
  "company": "Ksherera Dairy",
  "phone": "+91 98450 12345",
  "email": "ravi@ksherera.in",
  "city": "Bangalore",
  "vehicles": 5,
  "vehicle_type": "3W",
  "goods": "Dairy",
  "message": "Need 5 EVs for milk runs from January"
}`;

/**
 * Admin → Website leads: the address, the keys, and what to send.
 *
 * A key is shown once, the moment it is made — only its fingerprint is
 * stored — so the sheet that makes it stays open with Copy buttons until the
 * admin closes it.
 */
export function WebsiteLeads({ endpoint, keys }: { endpoint: string; keys: Key[] }) {
  const router = useRouter();
  const [making, setMaking] = React.useState(false);
  const [made, setMade] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  function create(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createIntakeKey(String(formData.get("label") ?? ""));
      if (!result.ok) return setError(result.error);
      setMade(result.data!.key);
      router.refresh();
    });
  }

  function close() {
    setMaking(false);
    setMade(null);
    setError(null);
  }

  function revoke(k: Key) {
    if (
      !window.confirm(
        `Revoke "${k.label}"? Anything still using it stops sending leads at once.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await revokeIntakeKey(k.id);
      showToast(result.ok ? "Key revoked" : result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-8">
      <Card>
        <CardHeader title="Address to send leads to" />
        <div className="space-y-2 px-4 pb-4">
          <CopyRow label="Address" value={endpoint} />
          <p className="text-[13px] text-muted">
            The website sends each lead here as a <b>POST</b>, with the key in an{" "}
            <code className="rounded bg-canvas px-1">Authorization: Bearer</code> header.
            A tool that only takes a web address can use the address with the key
            built in, shown when you make a key.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Keys"
          action={
            <Button size="sm" variant="secondary" onClick={() => setMaking(true)}>
              <Plus size={15} /> New key
            </Button>
          }
        />
        <div className="divide-y divide-line border-t border-line">
          {active.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-muted">
              No key yet. Make one, then give it to whoever runs the website.
            </p>
          ) : (
            active.map((k) => (
              <KeyRow key={k.id} k={k} onRevoke={() => revoke(k)} pending={pending} />
            ))
          )}
          {revoked.map((k) => (
            <KeyRow key={k.id} k={k} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="What the website sends" />
        <div className="space-y-3 px-4 pb-4 text-[13px]">
          <p className="text-muted">
            JSON or form fields. Only a <b>phone number or an email</b> is required;
            send whatever else the chatbot asked. Common names are understood — phone,
            mobile or whatsapp; name or first_name + last_name; company; city;
            vehicles; vehicle_type; goods; message.
          </p>
          <pre className="overflow-x-auto rounded-xl bg-canvas p-3 text-[12px] leading-relaxed">
            {EXAMPLE}
          </pre>
          <p className="text-muted">
            The reply is <code className="rounded bg-canvas px-1">201</code> with the new
            Lead ID. The same phone or email again within 30 minutes is not a second
            lead. The full guide for a developer is{" "}
            <code className="rounded bg-canvas px-1">docs/website-leads-api.md</code> in
            the CRM&apos;s code.
          </p>
        </div>
      </Card>

      <Sheet
        open={making}
        onClose={close}
        title={made ? "Copy this key now" : "New key"}
        action={made ? undefined : create}
        footer={
          made ? (
            <Button className="w-full" onClick={close}>
              Done — I have copied it
            </Button>
          ) : (
            <Button type="submit" variant="brand" className="w-full" disabled={pending}>
              {pending ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Make key
            </Button>
          )
        }
      >
        {made ? (
          <div className="space-y-3">
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              This is the only time the key is shown. Lost it? Make a new one and
              revoke this one.
            </p>
            <CopyRow label="Key" value={made} />
            <CopyRow
              label="Address with the key built in"
              value={`${endpoint}?key=${made}`}
            />
            <p className="text-[12.5px] text-muted">
              Treat both like a password: anyone with them can add leads. Keep them in
              the chatbot&apos;s server settings, never in the website&apos;s page code.
            </p>
          </div>
        ) : (
          <Field label="What is it for?">
            <Input name="label" required autoFocus defaultValue="Website chatbot" maxLength={80} />
          </Field>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-[13px] font-medium text-rose-700">
            {error}
          </p>
        ) : null}
      </Sheet>
    </div>
  );
}

function KeyRow({
  k,
  onRevoke,
  pending,
}: {
  k: Key;
  onRevoke?: () => void;
  pending?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="truncate">{k.label}</span>
          {k.revokedAt ? (
            <Badge className="bg-slate-100 text-slate-600">Revoked</Badge>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-[12.5px] text-muted">
          <code>{k.keyPrefix}…</code> · made {formatDate(k.createdAt)} ·{" "}
          {k.leadsReceived
            ? `${num(k.leadsReceived)} ${k.leadsReceived === 1 ? "lead" : "leads"}, last ${formatDateTimeInIndia(k.lastUsedAt!)}`
            : "no leads yet"}
        </p>
      </div>
      {onRevoke ? (
        <Button size="sm" variant="ghost" onClick={onRevoke} disabled={pending}>
          Revoke
        </Button>
      ) : null}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard blocked: a prompt still lets them copy it by hand.
      window.prompt(label, value);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <p className="mb-1 text-[12.5px] font-medium text-muted">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-line bg-canvas px-3 py-2.5 text-[12.5px]">
          {value}
        </code>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
        </Button>
      </div>
    </div>
  );
}
