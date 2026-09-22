import { Shimmer } from "@/components/skeletons";

/**
 * A deal opens from a tap on a card, so this frame is the card's own shape:
 * the stage stripe, the customer and the monthly value, then the buttons and
 * the two columns of detail underneath.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <Shimmer className="mb-2 h-9 w-24" />

      <div className="mb-3 overflow-hidden rounded-2xl border border-line bg-white">
        <Shimmer className="h-1 w-full rounded-none" />
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <Shimmer className="h-5 w-24 rounded-full" />
            <Shimmer className="mt-2 h-6 w-2/3" />
            <Shimmer className="mt-2 h-3 w-1/2" />
          </div>
          <Shimmer className="h-7 w-20" />
        </div>
      </div>

      <div className="flex gap-2">
        <Shimmer className="h-12 flex-1 rounded-xl" />
        <Shimmer className="h-12 flex-1 rounded-xl" />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-[14px] border border-line bg-white p-4">
            <Shimmer className="h-3 w-28" />
            {Array.from({ length: 3 }, (_, r) => (
              <Shimmer key={r} className="mt-3 h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
