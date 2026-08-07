// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  name: string;
  shortName: string | null;
  action: (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * A client form rather than a bare `<form action={serverAction}>`: the action
 * reports validation failure as a return value (thrown Server Action errors are
 * redacted in production), and only a client component can read that and show
 * it. Uses plain `useState` over `useActionState` deliberately — see the
 * `useTransition` warning in apps/web/CLAUDE.md.
 */
export function EditTeamForm({ name, shortName, action }: Props) {
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setIsPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="team-name" className="text-xs">
            Name
          </Label>
          <Input
            id="team-name"
            name="name"
            defaultValue={name}
            className="h-8 text-sm w-64"
            required
            onChange={() => {
              setError(null);
              setSaved(false);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="team-short-name" className="text-xs">
            Short Name
          </Label>
          <Input
            id="team-short-name"
            name="shortName"
            defaultValue={shortName ?? ""}
            placeholder="e.g. ALPH"
            className="h-8 text-sm w-28"
            onChange={() => {
              setError(null);
              setSaved(false);
            }}
          />
        </div>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
