import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <p className="text-2xl font-semibold tracking-tight">MoEVing CRM</p>
        <p className="text-sm text-muted">Pipeline, forecast and margins.</p>
      </div>
      <SignIn />
    </div>
  );
}
