import { PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  // The header and way-forward card, four stats, then the thread.
  return <PageSkeleton controls={1} tiles={4} rows={5} />;
}
