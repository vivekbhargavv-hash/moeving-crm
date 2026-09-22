/**
 * One line of confirmation, from anywhere.
 *
 * Sheets closed on success and said nothing, so a stage change, a qualified
 * lead or a saved deal looked the same as a tap that missed. Any component
 * can call `showToast()`; the app shell owns the one toast on screen.
 */
const EVENT = "moeving:toast";

export function showToast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

/** For the shell: call `onToast` with every message, until unsubscribed. */
export function onToast(onToast: (message: string) => void) {
  const listener = (e: Event) => onToast((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
