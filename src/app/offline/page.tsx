export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">You are offline</h1>
      <p className="max-w-sm text-sm text-muted">
        The CRM needs a connection to show live pipeline numbers. Reconnect and
        pull to refresh — nothing you typed is sent until you are back online.
      </p>
    </div>
  );
}
