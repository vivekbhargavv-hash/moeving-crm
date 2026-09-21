"use client";

import { CopyPlus } from "lucide-react";
import * as React from "react";

import { type MasterData, type Prefill, QuickAdd } from "@/components/quick-add";
import type { Session } from "@/server/auth";

/**
 * Repeat business, from the won deal it grows out of.
 *
 * The button opens the ordinary new-deal sheet carrying this customer's setup,
 * so the follow-on gets its own expected close date, its own fleet and its own
 * cost sheet when it lands. Nothing about the won deal changes — its close date
 * is the month it was won, and the wins report has to keep saying so.
 */
export function ExpandDeal({
  prefill,
  master,
  session,
}: {
  prefill: Prefill;
  master: MasterData;
  session: Session;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-brand bg-brand-soft text-[15px] font-semibold text-brand-ink active:scale-[0.99]"
      >
        <CopyPlus size={18} />
        Deploy more vehicles
      </button>
      <QuickAdd
        open={open}
        onClose={() => setOpen(false)}
        master={master}
        session={session}
        prefill={prefill}
      />
    </>
  );
}
