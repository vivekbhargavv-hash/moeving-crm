"use client";

import { Star } from "lucide-react";
import * as React from "react";

import { whileBusy } from "@/lib/busy";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { setStrategic } from "@/server/meeting-actions";

/**
 * Puts a customer on the leadership watchlist, or takes it off. Admin only —
 * the whole value of the board is that the list is short and somebody owns
 * what is on it.
 */
export function StrategicToggle({
  accountId,
  isStrategic,
  name,
}: {
  accountId: string;
  isStrategic: boolean;
  name: string;
}) {
  const [on, setOn] = React.useState(isStrategic);
  const [pending, startTransition] = React.useTransition();

  function toggle() {
    const next = !on;
    startTransition(async () => {
      const result = await whileBusy(setStrategic(accountId, next));
      if (!result.ok) return showToast(result.error);
      setOn(next);
      showToast(
        next ? `${name} is on the watchlist` : `${name} taken off the watchlist`,
      );
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition disabled:opacity-50",
        on
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-line bg-white text-muted hover:bg-canvas hover:text-ink",
      )}
    >
      <Star size={14} className={cn(on && "fill-amber-400 text-amber-500")} />
      {on ? "Strategic" : "Mark strategic"}
    </button>
  );
}
