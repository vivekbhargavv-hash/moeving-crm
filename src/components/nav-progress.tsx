"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";

import { onBusy } from "@/lib/busy";

/** Anything quicker than this is not worth a flicker. */
const SHOW_AFTER_MS = 300;
/** A navigation that never lands (offline, an error page) must not spin forever. */
const GIVE_UP_MS = 20_000;

/**
 * A thin bar across the top and a small spinner, shown only when the app has
 * been waiting on the server for longer than a blink.
 *
 * It notices a tap on any in-app link by itself (a capture-phase listener, so
 * no Link needs to know about it), and anything that navigates or saves from
 * code signals through `lib/busy.ts`. A navigation ends when the URL changes.
 */
export function NavProgress({ busy = false }: { busy?: boolean }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [navigating, setNavigating] = React.useState(false);
  const [work, setWork] = React.useState(0);
  const [visible, setVisible] = React.useState(false);

  // The URL moved: whatever navigation was pending has landed.
  React.useEffect(() => setNavigating(false), [pathname, query]);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page (or just a #hash): nothing will load, so nothing will end it.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      setNavigating(true);
    }
    document.addEventListener("click", onClick, true);
    const off = onBusy((signal) => {
      if (signal.kind === "navigate") setNavigating(true);
      else setWork((n) => Math.max(0, n + (signal.kind === "start" ? 1 : -1)));
    });
    return () => {
      document.removeEventListener("click", onClick, true);
      off();
    };
  }, []);

  React.useEffect(() => {
    if (!navigating) return;
    const t = setTimeout(() => setNavigating(false), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [navigating]);

  const pending = navigating || work > 0 || busy;
  React.useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [pending]);

  if (!visible) return null;
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] overflow-hidden bg-brand/15"
      >
        <div className="nav-progress-bar h-full w-1/3 rounded-full bg-brand" />
      </div>
      {/* Phone: a pill above the tab bar, clear of the header's controls.
          Desktop: a round spinner in the top-right corner. */}
      <div
        role="status"
        aria-label="Loading"
        className="pointer-events-none fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-[70] flex h-9 -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-white px-3.5 text-[13px] font-medium text-ink shadow-md md:bottom-auto md:left-auto md:right-5 md:top-4 md:w-9 md:translate-x-0 md:justify-center md:px-0"
      >
        <Loader2 size={17} className="animate-spin text-brand-ink" />
        <span className="md:sr-only">Loading…</span>
      </div>
    </>
  );
}
