import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A won deal with no signed agreement behind it.
 *
 * A warning, never a block: Vivek, Oct 2026 — a win is recorded when it is
 * won, and the paper can follow. Amber, because it is something to chase,
 * not something that went wrong.
 */
export function NoAgreementMark({ className }: { className?: string }) {
  return (
    <span
      title="Won, with no signed agreement uploaded. Upload it on the customer's page."
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800",
        className,
      )}
    >
      <AlertTriangle size={11} aria-hidden="true" />
      No agreement
    </span>
  );
}

/** Whether a deal should carry the mark: won, and nothing covering it. */
export const missingAgreement = (o: { stage: string; hasAgreement: boolean }) =>
  o.stage === "closed_won" && !o.hasAgreement;
