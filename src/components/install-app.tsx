"use client";

import { Check, Plus, Share, Smartphone } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui";

/**
 * Installing Good Deal to the home screen.
 *
 * Android and desktop Chrome fire `beforeinstallprompt`, which can be saved
 * and replayed from a tap — a real one-press install.
 *
 * Nobody else does. iOS Safari has no equivalent API and never will; Apple
 * only offers Share → Add to Home Screen. Firefox does not implement the
 * event either, on any platform — and Mozilla has said it will not — though
 * Firefox for Android can still install this from its own menu.
 *
 * So a browser with no button is the normal case, not a failure, and each of
 * these gets the steps that actually work there instead of one message that
 * reads like something went wrong.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallApp() {
  const [promptEvent, setPromptEvent] = React.useState<InstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);
  const [firefox, setFirefox] = React.useState<null | "android" | "other">(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // Safari's own flag, which predates the standard media query.
      (window.navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const ua = window.navigator.userAgent;
    // iPadOS 13+ reports itself as a Mac, so a touch-capable "Mac" is an iPad.
    setIsIos(
      /iphone|ipod/i.test(ua) ||
        /ipad/i.test(ua) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
    );

    // `fxios` is Firefox on iOS, which is Safari underneath and cannot install
    // anything — the iOS branch below already tells that story, and it is
    // checked first, so only real Gecko reaches the Firefox branch.
    if (/firefox|fxios/i.test(ua)) {
      setFirefox(/android/i.test(ua) ? "android" : "other");
    }

    function onPrompt(e: Event) {
      // Chrome shows its own mini-infobar unless this is prevented; the point
      // of this screen is that the install lives somewhere findable.
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // The saved event is single-use, whichever way they answered.
    setPromptEvent(null);
    if (outcome === "dismissed") setDismissed(true);
  }

  if (installed) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <Check size={17} />
        Installed. You are using the app.
      </p>
    );
  }

  if (promptEvent) {
    return (
      <div>
        <Button variant="brand" size="lg" className="w-full" onClick={install}>
          <Smartphone size={18} /> Install Good Deal
        </Button>
        <p className="mt-2 text-[13px] text-muted">
          Adds it to your home screen and opens it full screen, without the
          browser bar.
        </p>
      </div>
    );
  }

  if (isIos) {
    return (
      <div>
        <p className="text-sm">On iPhone and iPad, Safari installs it for you:</p>
        <ol className="mt-3 space-y-2.5 text-sm">
          <Step n={1}>
            Tap <Share size={15} className="inline align-[-2px]" />{" "}
            <strong>Share</strong> at the bottom of Safari.
          </Step>
          <Step n={2}>
            Scroll down and tap{" "}
            <Plus size={15} className="inline align-[-2px]" />{" "}
            <strong>Add to Home Screen</strong>.
          </Step>
          <Step n={3}>
            Tap <strong>Add</strong>. Good Deal appears with your other apps.
          </Step>
        </ol>
        <p className="mt-3 text-[13px] text-muted">
          It has to be Safari — Chrome on iPhone cannot add to the home screen.
        </p>
      </div>
    );
  }

  if (firefox === "android") {
    return (
      <div>
        <p className="text-sm">
          Firefox can install this, but it does not offer a button for a page
          to press — so it is two taps in Firefox&apos;s own menu:
        </p>
        <ol className="mt-3 space-y-2.5 text-sm">
          <Step n={1}>
            Tap <strong>⋮</strong> at the edge of the Firefox toolbar.
          </Step>
          <Step n={2}>
            Tap <Plus size={15} className="inline align-[-2px]" />{" "}
            <strong>Install</strong> — older versions call it{" "}
            <strong>Add app to Home screen</strong>, under <strong>More</strong>.
          </Step>
        </ol>
        <p className="mt-3 text-[13px] text-muted">
          Chrome does the same thing with one tap here, if you would rather use
          it.
        </p>
      </div>
    );
  }

  if (firefox === "other") {
    return (
      <div>
        <p className="text-sm">
          Firefox on a computer cannot install web apps, so there is nothing
          for this screen to offer.
        </p>
        <p className="mt-2 text-[13px] text-muted">
          Open Good Deal in <strong>Chrome</strong> or <strong>Edge</strong> and
          use the install icon at the right-hand end of the address bar. On a
          phone, Firefox for Android can install it from its own ⋮ menu.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm">
        {dismissed
          ? "Install was cancelled. Reload this page to try again."
          : "Your browser has not offered an install yet."}
      </p>
      <p className="mt-2 text-[13px] text-muted">
        On Android, open this page in Chrome and use the ⋮ menu →{" "}
        <strong>Add to Home screen</strong>. On a desktop, look for the install
        icon at the right-hand end of the address bar.
      </p>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas text-[12px] font-bold text-muted">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
