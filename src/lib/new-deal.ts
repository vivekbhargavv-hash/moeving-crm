/**
 * Opening the New deal sheet from anywhere, optionally filled in.
 *
 * The sheet lives in the app shell, so a deal page asking for "the same deal
 * again" cannot reach it directly; like `showToast()`, it sends an event the
 * shell listens for.
 */
export type DealPrefill = {
  accountName: string;
  cityId: string | null;
  vehicleTypeId: string | null;
  driverType: string | null;
  chargingScope: string | null;
  fleetSize: number;
  price: number | null;
  operatingDays: number | null;
  /** "YYYY-MM"; ignored when it is no longer one of the months offered. */
  expectedCloseMonth: string | null;
  notes: string | null;
  ownerUserId: string;
};

const EVENT = "moeving:new-deal";

export function openNewDeal(prefill?: DealPrefill) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DealPrefill | undefined>(EVENT, { detail: prefill }));
}

/** For the shell: called with the prefill (or nothing) on every request. */
export function onOpenNewDeal(handler: (prefill?: DealPrefill) => void) {
  const listener = (e: Event) =>
    handler((e as CustomEvent<DealPrefill | undefined>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
