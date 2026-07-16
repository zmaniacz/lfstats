// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import type { TeamPenaltyRecord } from "@lfstats/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TeamPenaltyForm({
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
}: {
  defaultValues?: TeamPenaltyRecord;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [type, setType] = useState(defaultValues?.type ?? "");
  const [scoreValue, setScoreValue] = useState(String(defaultValues?.scoreValue ?? 0));

  return (
    <form action={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
        <Input
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="e.g. Forfeit, Delay of Game"
          className="h-8 text-sm w-48"
          disabled={isPending}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Input
          name="description"
          defaultValue={defaultValues?.description ?? ""}
          className="h-8 text-sm w-48"
          disabled={isPending}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Score Value</Label>
        <Input
          name="scoreValue"
          type="number"
          value={scoreValue}
          onChange={(e) => setScoreValue(e.target.value)}
          className="h-8 text-sm w-24"
          disabled={isPending}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
