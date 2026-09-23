"use client";

import { Bell, BellOff, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui";
import { showToast } from "@/lib/toast";
import { removePushSubscription, savePushSubscription } from "@/server/actions";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const DISMISSED = "leads-push-prompt-dismissed";

type State =
  | "loading"
  | "unsupported" // no push in this browser — or iOS not installed to Home Screen
  | "off" // never asked, or turned off here
  | "on"
  | "blocked"; // the person said no; only browser settings can undo it

/**
 * Turning on "a lead has been assigned to you" notifications for this device.
 *
 * `compact` is the one-line prompt on the Leads screen: shown only while the
 * answer is still "not asked", and dismissable. The full version lives in
 * Settings, where it also explains the iPhone rule and can be switched off.
 *
 * Asking is always a tap on a button — browsers refuse a permission prompt
 * nobody asked for, and a prompt on page load is how people learn to say no.
 */
export function EnableNotifications({ compact = false }: { compact?: boolean }) {
  const [state, setState] = React.useState<State>("loading");
  const [busy, setBusy] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    let live = true;
    try {
      setDismissed(localStorage.getItem(DISMISSED) === "1");
    } catch {
      setDismissed(false);
    }
    (async () => {
      if (
        !PUBLIC_KEY ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (live) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (live) setState("blocked");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") {
        // Re-sent on every visit: the same phone signed in as someone else
        // should notify the person holding it now.
        savePushSubscription(sub.toJSON()).catch(() => {});
        if (live) setState("on");
      } else if (live) {
        setState("off");
      }
    })().catch(() => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      // Registering is idempotent, and makes this work before the app shell
      // has got round to it.
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(PUBLIC_KEY!),
        }));
      const result = await savePushSubscription(sub.toJSON());
      if (!result.ok) throw new Error(result.error);
      setState("on");
      showToast("Notifications on for this device");
    } catch {
      showToast("Could not turn notifications on. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      showToast("Notifications off for this device");
    } catch {
      showToast("Could not turn notifications off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      /* A private window forgets; the prompt comes back next time. */
    }
  }

  if (compact) {
    if (state !== "off" || dismissed) return null;
    return (
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5">
        <Bell size={17} className="shrink-0 text-brand-ink" />
        <p className="min-w-0 flex-1 text-[13px]">
          Get a notification when a lead is assigned to you.
        </p>
        <Button variant="brand" disabled={busy} onClick={turnOn}>
          {busy ? "Turning on…" : "Turn on"}
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted active:bg-canvas"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  if (state === "loading") return <p className="text-sm text-muted">Checking…</p>;

  if (state === "unsupported") {
    return (
      <p className="text-sm text-muted">
        This browser cannot show notifications. On an iPhone, install the app
        to your Home Screen first (above), open it from there, and come back
        to this page.
      </p>
    );
  }

  if (state === "blocked") {
    return (
      <p className="flex items-start gap-2 text-sm text-muted">
        <BellOff size={16} className="mt-0.5 shrink-0" />
        Notifications are blocked for this site. Allow them in your browser&apos;s
        site settings, then reload this page.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <p className="min-w-0 flex-1 text-sm">
        {state === "on"
          ? "On for this device. You will be notified when a lead is assigned to you."
          : "Get a notification on this device when a lead is assigned to you."}
      </p>
      {state === "on" ? (
        <Button variant="secondary" disabled={busy} onClick={turnOff}>
          Turn off
        </Button>
      ) : (
        <Button variant="brand" disabled={busy} onClick={turnOn}>
          {busy ? "Turning on…" : "Turn on"}
        </Button>
      )}
    </div>
  );
}

/** The VAPID public key is URL-safe base64; the Push API wants bytes. */
function base64UrlToBytes(value: string) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
