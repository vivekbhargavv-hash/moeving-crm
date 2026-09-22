import { PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  // Search, the two switches and Filters, over a list of deals.
  return <PageSkeleton controls={4} rows={8} />;
}
