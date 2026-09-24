/**
 * "The app is waiting on the server", from anywhere.
 *
 * A tap on a link is noticed by the shell on its own. Two things are not: a
 * `router.push()` from code (a table row, a filter) and a server action that
 * takes a while (deleting a deal). Those call in here, and the shell's
 * progress bar and spinner show once the wait is long enough to notice.
 */
const EVENT = "moeving:busy";

export type BusySignal = { kind: "navigate" } | { kind: "start" | "end" };

function send(detail: BusySignal) {
  if (typeof window === "undefined") return;
  // On the next tick, not now: these are usually called inside
  // startTransition, and a state update made there waits for the whole
  // transition — the spinner would appear only once there was nothing left
  // to wait for.
  setTimeout(() =>
    window.dispatchEvent(new CustomEvent<BusySignal>(EVENT, { detail })),
  );
}

/**
 * Call just before a `router.push(href)`; it clears when the URL changes.
 * A push to the page already showing changes no URL, so it is ignored rather
 * than left spinning.
 */
export function startNavigation(href?: string) {
  if (typeof window === "undefined") return;
  if (href) {
    const url = new URL(href, window.location.href);
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    ) {
      return;
    }
  }
  send({ kind: "navigate" });
}

/** Shows the indicator for as long as `work` runs. */
export async function whileBusy<T>(work: Promise<T>): Promise<T> {
  send({ kind: "start" });
  try {
    return await work;
  } finally {
    send({ kind: "end" });
  }
}

/** For the shell. */
export function onBusy(listener: (signal: BusySignal) => void) {
  const handler = (e: Event) => listener((e as CustomEvent<BusySignal>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
