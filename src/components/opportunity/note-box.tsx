"use client";

import * as React from "react";

import { Button, Textarea } from "@/components/ui";
import { addNote } from "@/server/actions";

export function NoteBox({ opportunityId }: { opportunityId: string }) {
  const [body, setBody] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await addNote(opportunityId, body);
      if (result.ok) {
        setBody("");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a note — what happened, what's next?"
        className="min-h-20"
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || !body.trim()}
        onClick={submit}
      >
        {pending ? "Adding…" : "Add note"}
      </Button>
    </div>
  );
}
