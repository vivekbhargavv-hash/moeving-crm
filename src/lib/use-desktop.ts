"use client";

import * as React from "react";

/** Tailwind's `md` breakpoint, where the phone layout gives way to the desktop one. */
const DESKTOP = "(min-width: 768px)";

/**
 * Whether the desktop layout is the one on screen.
 *
 * Screens with a phone layout and a desktop layout used to render BOTH and
 * hide one with CSS, which meant a phone building a 200-card desktop board it
 * would never show. This lets a screen render only the one it needs.
 *
 * `initial` is the server's guess from the user agent, so the first paint and
 * hydration agree and a phone never gets the desktop layout at all. The media
 * query corrects a wrong guess right after hydration and follows a resized or
 * rotated window after that.
 */
export function useIsDesktop(initial: boolean) {
  const [desktop, setDesktop] = React.useState(initial);
  React.useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}
