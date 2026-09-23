import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { NotProvisionedError, requireSession } from "@/server/auth";
import { countLeadsAwaitingMe } from "@/server/queries";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await requireSession();
  } catch (error) {
    if (error instanceof NotProvisionedError) redirect("/no-access");
    throw error;
  }

  // The shell wraps every page, so anything queried here is queried on every
  // navigation. The one exception is the Leads badge — a single indexed count
  // that is the whole point of assigning somebody a lead. Everything else
  // (the Add deal sheet's master data included) is fetched where it is used.
  const leadsAwaiting = await countLeadsAwaitingMe();

  return (
    <AppShell session={session} leadsAwaiting={leadsAwaiting}>
      {children}
    </AppShell>
  );
}
