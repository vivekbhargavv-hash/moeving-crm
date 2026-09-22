import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { NotProvisionedError, requireSession } from "@/server/auth";

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

  // Deliberately nothing else fetched here: the shell wraps every page, so
  // anything queried here is queried on every navigation. The Add deal sheet
  // fetches its own master data when somebody opens it.
  return (
    <AppShell session={session}>
      {children}
    </AppShell>
  );
}
