import { PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  // Two tab switches, four tiles, then a row per strategic account.
  return <PageSkeleton controls={2} tiles={4} rows={8} />;
}
