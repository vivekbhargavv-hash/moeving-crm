"use client";

import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Badge, Button, Card, CardHeader, Field, Input, Sheet } from "@/components/ui";
import { reorderMasterItems, upsertMasterItem } from "@/server/actions";

type Item = { id: string; label: string; isActive: boolean };
type Table = "cities" | "vehicleTypes" | "lostReasons";

export function MasterDataEditor({
  table,
  title,
  items,
  /** Show move up/down controls — the list order is the dropdown order. */
  orderable,
  orderHint,
}: {
  table: Table;
  title: string;
  items: Item[];
  orderable?: boolean;
  orderHint?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Item | "new" | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const current = editing === "new" ? null : editing;

  // Reordering is optimistic: a move is one tap and waiting for a round trip
  // before the row moves makes the list feel broken.
  const [order, setOrder] = React.useState<Item[] | null>(null);
  const list = order ?? items;
  React.useEffect(() => setOrder(null), [items]);

  function move(index: number, by: -1 | 1) {
    const next = [...list];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to]!, next[index]!];
    setOrder(next);
    startTransition(async () => {
      const result = await reorderMasterItems(
        table,
        next.map((i) => i.id),
      );
      if (!result.ok) {
        setOrder(null); // put it back where the server says it is
        return setError(result.error);
      }
      router.refresh();
    });
  }

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
            className="-mr-1.5 inline-flex h-11 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-brand-ink active:bg-brand-soft"
          >
            <Plus size={15} /> Add
          </button>
        }
      />
      {orderable ? (
        <div className="px-4 pb-4">
          {orderHint ? (
            <p className="mb-2 text-[13px] text-muted">{orderHint}</p>
          ) : null}
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {list.map((item, i) => (
              <li key={item.id} className="flex items-center gap-1 bg-white pl-3 pr-1">
                <span className="tabular w-5 shrink-0 text-[12px] text-muted">
                  {i + 1}
                </span>
                <button
                  onClick={() => setEditing(item)}
                  className="flex min-w-0 flex-1 items-center gap-2 py-3.5 text-left text-sm"
                >
                  <span className="truncate">{item.label}</span>
                  {!item.isActive ? (
                    <Badge className="bg-slate-100 text-slate-500">off</Badge>
                  ) : null}
                </button>
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || pending}
                  aria-label={`Move ${item.label} up`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted disabled:opacity-25 active:bg-canvas"
                >
                  <ChevronUp size={18} />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === list.length - 1 || pending}
                  aria-label={`Move ${item.label} down`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted disabled:opacity-25 active:bg-canvas"
                >
                  <ChevronDown size={18} />
                </button>
              </li>
            ))}
          </ul>
          {list.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet.</p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setEditing(item)}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm hover:bg-canvas"
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
      )}

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
