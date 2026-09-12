import { SignOutButton } from "@clerk/nextjs";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">No CRM account yet</h1>
      <p className="max-w-sm text-sm text-muted">
        You are signed in, but this email has not been added to the CRM. Ask an
        admin to add you under Admin → Users with this exact email address, then
        sign in again.
      </p>
      <SignOutButton>
        <button className="h-11 rounded-xl bg-ink px-5 font-medium text-white">
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}
