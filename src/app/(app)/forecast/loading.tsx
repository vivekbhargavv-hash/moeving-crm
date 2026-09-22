import { PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  // The Forecast/Wins tabs and the measure switch, over the month grid.
  return <PageSkeleton controls={2} rows={7} />;
}
