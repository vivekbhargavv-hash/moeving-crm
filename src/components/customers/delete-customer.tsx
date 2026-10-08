"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button, Sheet } from "@/components/ui";
import { startNavigation, whileBusy } from "@/lib/busy";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { deleteCustomer } from "@/server/customer-actions";

/**
 * Admin-only delete for a customer with no deals. Shown only where it can
 * succeed; the server refuses everything else regardless.
 *
 * `compact` is the bin icon on a list row; otherwise a full-width text
 * button for the customer's own page, which goes back to the list after.
 */
export function DeleteCustomer({
  id,
  name,
  compact,
}: {
  id: string;
  name: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await whileBusy(deleteCustomer(id));
        if (!result.ok) return setError(result.error);
        showToast(`${name} deleted`);
        setOpen(false);
        // On the customer's own page there is nothing left to show.
        if (!compact) {
          startNavigation("/customers");
          router.push("/customers");
        }
      } catch {
        setError("Could not delete that. Check your connection and try again.");
      }
    });
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={(e) => {
            // The row is a link; the bin must not open the customer.
            e.preventDefault();
            e.stopPropagation();
            setError(null);
            setOpen(true);
          }}
          aria-label={`Delete ${name}`}
          title="Delete this customer — it has no deals"
          className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-rose-50 hover:text-rose-700 active:bg-rose-50"
        >
          <Trash2 size={17} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="mx-auto mt-4 flex h-11 items-center gap-1.5 rounded-xl px-3 text-[14px] font-medium text-rose-700 active:bg-rose-50"
        >
          <Trash2 size={15} /> Delete this customer
        </button>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this customer"
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={pending}
              onClick={remove}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        }
      >
        <p className="text-sm">
          Permanently delete <strong>{name}</strong>? It has no deals, so
          nothing else changes. If it is needed again, it comes back the next
          time somebody raises a deal with that name.
        </p>
        {error ? (
          <p
            role="alert"
            className={cn("mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700")}
          >
            {error}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}
