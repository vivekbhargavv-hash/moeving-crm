import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { NotProvisionedError, requireSession } from "@/server/auth";
import { getMasterData } from "@/server/queries";

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

  const master = await getMasterData();

  return (
    <AppShell session={session} master={master}>
      {children}
    </AppShell>
  );
}
