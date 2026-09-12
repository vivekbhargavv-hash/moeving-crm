"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Badge, Button, Card, CardHeader, Field, Input, Sheet } from "@/components/ui";
import { upsertMasterItem } from "@/server/actions";

type Item = { id: string; label: string; isActive: boolean };
type Table = "cities" | "vehicleTypes" | "lostReasons";

export function MasterDataEditor({
  table,
  title,
  items,
}: {
  table: Table;
  title: string;
  items: Item[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Item | "new" | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const current = editing === "new" ? null : editing;

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertMasterItem(table, formData);
      if (!result.ok) return setError(result.error);
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink"
          >
            <Plus size={15} /> Add
          </button>
        }
      />
      <div className="flex flex-wrap gap-2 px-4 pb-4">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setEditing(item)}
            className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm hover:bg-canvas"
          >
            {item.label}
            {!item.isActive ? (
              <Badge className="bg-slate-100 text-slate-500">off</Badge>
            ) : null}
          </button>
        ))}
        {items.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : null}
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? `Edit ${title.toLowerCase()}` : `Add to ${title.toLowerCase()}`}
      >
        <form action={save} className="space-y-4">
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <Field label="Name">
            <Input name="label" required autoFocus defaultValue={current?.label ?? ""} />
          </Field>
          {current ? (
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={current.isActive}
                className="h-5 w-5 rounded border-line"
              />
              Show in dropdowns
            </label>
          ) : null}
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <Button variant="brand" size="lg" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </Sheet>
    </Card>
  );
}
