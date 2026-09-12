"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Badge, Button, Card, Field, Input, Select, Sheet } from "@/components/ui";
import { upsertUser } from "@/server/actions";

type Row = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "sales";
  isActive: boolean;
  linked: boolean;
};

export function AdminUsers({ users }: { users: Row[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Row | "new" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertUser(formData);
      if (!result.ok) return setError(result.error);
      setEditing(null);
      router.refresh();
    });
  }

  const current = editing === "new" ? null : editing;

  return (
    <>
      <Button className="mb-3 w-full sm:w-auto" onClick={() => setEditing("new")}>
        Add user
      </Button>

      <Card className="divide-y divide-line">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => setEditing(u)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{u.name}</p>
              <p className="truncate text-[13px] text-muted">{u.email}</p>
            </div>
            {!u.linked ? (
              <Badge className="bg-amber-100 text-amber-900">Invite pending</Badge>
            ) : null}
            {!u.isActive ? (
              <Badge className="bg-slate-100 text-slate-600">Disabled</Badge>
            ) : null}
            <Badge
              className={
                u.role === "admin"
                  ? "bg-violet-100 text-violet-800"
                  : "bg-slate-100 text-slate-700"
              }
            >
              {u.role === "admin" ? "Admin" : "Deal Owner"}
            </Badge>
          </button>
        ))}
      </Card>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? "Edit user" : "Add user"}
      >
        <form action={save} className="space-y-4">
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <Field label="Name">
            <Input name="name" required defaultValue={current?.name ?? ""} />
          </Field>
          <Field
            label="Work email"
            hint="Must match the email they sign in to Clerk with."
          >
            <Input
              name="email"
              type="email"
              required
              defaultValue={current?.email ?? ""}
            />
          </Field>
          <Field label="Role">
            <Select name="role" defaultValue={current?.role ?? "sales"}>
              <option value="sales">Deal Owner</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={current?.isActive ?? true}
              className="h-5 w-5 rounded border-line"
            />
            Active — can sign in and own deals
          </label>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <Button variant="brand" size="lg" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
