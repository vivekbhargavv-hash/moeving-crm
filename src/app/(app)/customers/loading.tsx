import { PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  // Search and the view switch, over a list of customers.
  return <PageSkeleton controls={2} rows={8} />;
}
