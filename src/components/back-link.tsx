"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { backLabel, previousPage } from "@/lib/nav-history";

/**
 * Back to where this page was opened from, as it was left.
 *
 * Going back through history keeps the list's search, filters and scroll;
 * a fresh link to the list would lose all three. With nothing to go back to
 * — a deal opened from a shared link, or in a new tab — it is an ordinary
 * link to `fallbackHref`.
 */
export function BackLink({
  fallbackHref,
  fallbackLabel,
}: {
  fallbackHref: string;
  fallbackLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [label, setLabel] = React.useState<string | null>(null);

  // Read after mount: sessionStorage is not there on the server, and the
  // first render has to match it.
  React.useEffect(() => {
    const previous = previousPage(pathname);
    setLabel(previous && window.history.length > 1 ? backLabel(previous) : null);
  }, [pathname]);

  return (
    <Link
      href={fallbackHref}
      onClick={(e) => {
        if (!label || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        router.back();
      }}
      className="mb-2 inline-flex h-11 items-center gap-1 pr-3 text-[15px] font-medium text-brand-ink active:opacity-70"
    >
      <ArrowLeft size={18} /> {label ?? fallbackLabel}
    </Link>
  );
}
