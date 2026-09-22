import { cn } from "@/lib/utils";

/**
 * What a screen shows while the server is answering.
 *
 * Every page here is rendered per request, so a tap used to leave you on the
 * page you were leaving, with nothing moving, until the whole next page came
 * back. A `loading.tsx` boundary changes that twice over: the tap paints
 * immediately, and Next can prefetch the boundary, so the shape of the next
 * screen is already on the phone before the data is.
 *
 * These are shapes, not spinners — the layout lands once, and the real content
 * drops into a frame that is already the right size.
 */
export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-canvas", className)}
    />
  );
}

/** The heading block every desktop screen opens with. */
export function TitleSkeleton() {
  return (
    <div className="mb-4 hidden md:block">
      <Shimmer className="h-7 w-40" />
      <Shimmer className="mt-2 h-4 w-64" />
    </div>
  );
}

/** A row of controls: switches, pickers, a search field. */
export function ControlsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="mb-4 flex gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Shimmer key={i} className={cn("h-11 rounded-xl", i === 0 ? "flex-1" : "w-32")} />
      ))}
    </div>
  );
}

/** Stacked cards — the phone shape of almost every list in the app. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="rounded-[14px] border border-line bg-white p-4"
        >
          <Shimmer className="h-4 w-1/2" />
          <Shimmer className="mt-2.5 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** A grid of figures, as the dashboard and forecast open with. */
export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-[14px] border border-line bg-white p-4">
          <Shimmer className="h-3 w-20" />
          <Shimmer className="mt-3 h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

/** The one screen-level fallback most pages want. */
export function PageSkeleton({
  controls = 3,
  rows = 6,
  tiles,
}: {
  controls?: number;
  rows?: number;
  tiles?: number;
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <TitleSkeleton />
      {tiles ? <TilesSkeleton count={tiles} /> : null}
      <ControlsSkeleton count={controls} />
      <ListSkeleton rows={rows} />
    </div>
  );
}
