import { PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  // Four KPI tiles, then the funnel and the lists under them.
  return <PageSkeleton tiles={4} controls={1} rows={5} />;
}
