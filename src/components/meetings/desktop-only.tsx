import { Monitor } from "lucide-react";
import Link from "next/link";

/**
 * Meetings is a desktop screen (Vivek, 27 Nov).
 *
 * The board is a dozen accounts, each with a status, a date and a sentence
 * about what happens next, and reading those side by side is the point — on a
 * phone it becomes a stack of cards nobody scans. So nothing on a phone
 * offers the module, and anyone who arrives on one by link or notification
 * gets told why rather than half a table.
 *
 * Wrap the real screen in `<div className="hidden md:block">` and put this
 * beside it in `<div className="md:hidden">`.
 */
export function DesktopOnlyNotice({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-sm rounded-[14px] border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-canvas text-muted">
        <Monitor size={20} aria-hidden="true" />
      </span>
      <p className="font-semibold">{what} opens on a computer</p>
      <p className="mt-1 text-sm text-muted">
        It is a wide table — every account, what was agreed and who owes the
        next move — so it is built for a laptop screen rather than a phone.
      </p>
      <Link
        href="/pipeline"
        className="mt-4 inline-flex h-11 items-center rounded-xl border border-line px-4 text-[15px] font-medium"
      >
        Back to Pipeline
      </Link>
    </div>
  );
}
