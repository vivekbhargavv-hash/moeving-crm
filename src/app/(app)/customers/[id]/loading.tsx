import { ListSkeleton, TilesSkeleton, TitleSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <TitleSkeleton />
      <TilesSkeleton count={4} />
      <ListSkeleton rows={5} />
    </div>
  );
}
