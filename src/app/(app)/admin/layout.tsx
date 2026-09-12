import Link from "next/link";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/master-data", label: "Master data" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mx-auto mb-4 flex max-w-3xl gap-2">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-canvas"
          >
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
