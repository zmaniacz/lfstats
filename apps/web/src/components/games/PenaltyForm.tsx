// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useId, useState } from "react";
import type { PenaltyRecord } from "@lfstats/db";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ELEVATED_MVP, ELEVATED_SCORE, PENALTY_DEFINITIONS } from "@/lib/penalty-definitions";

function isElevated(score: number, mvp: number): boolean {
  return score === ELEVATED_SCORE && mvp === ELEVATED_MVP;
}

export function PenaltyForm({
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
}: {
  defaultValues?: PenaltyRecord;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const elevateId = useId();
  const [type, setType] = useState(defaultValues?.type ?? "Common Foul");
  const [scoreValue, setScoreValue] = useState(String(defaultValues?.scoreValue ?? 0));
  const [mvpValue, setMvpValue] = useState(String(defaultValues?.mvpValue ?? 0));
  const [elevated, setElevated] = useState(
    isElevated(defaultValues?.scoreValue ?? 0, defaultValues?.mvpValue ?? 0),
  );

  function handleTypeChange(value: string) {
    setType(value);
    const match = PENALTY_DEFINITIONS.find((d) => d.name === value);
    if (match) {
      setScoreValue(String(match.defaultScore));
      setMvpValue(String(match.defaultMvp));
      setElevated(isElevated(match.defaultScore, match.defaultMvp));
    }
  }

  function handleElevateChange(checked: boolean) {
    setElevated(checked);
    setScoreValue(String(checked ? ELEVATED_SCORE : 0));
    setMvpValue(String(checked ? ELEVATED_MVP : 0));
  }

  return (
    <form action={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
        {/* Hidden input is the source of truth for submission — decouples FormData
            collection from the combobox's own DOM value, which may lag behind
            React state when an item is selected vs. freely typed. */}
        <input type="hidden" name="type" value={type} />
        <Combobox value={type} onValueChange={(value) => handleTypeChange(value ?? "")}>
          <ComboboxInput
            className="h-8 text-sm w-44"
            placeholder="Select or type a penalty…"
            disabled={isPending}
            onChange={(e) => handleTypeChange(e.target.value)}
          />
          <ComboboxEmpty>No matches — using custom type</ComboboxEmpty>
          <ComboboxContent>
            <ComboboxList>
              {PENALTY_DEFINITIONS.map((def) => (
                <ComboboxItem key={def.name} value={def.name}>
                  <span className="flex-1">{def.name}</span>
                  <span className="text-muted-foreground text-[11px] tabular-nums">
                    {def.defaultScore} · {def.defaultMvp}
                  </span>
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
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
      <div className="space-y-1">
        <Label className="text-xs">MVP Value</Label>
        <Input
          name="mvpValue"
          type="number"
          step="0.001"
          value={mvpValue}
          onChange={(e) => setMvpValue(e.target.value)}
          className="h-8 text-sm w-24"
          disabled={isPending}
        />
      </div>
      <div className="flex items-center gap-2 pb-1.5">
        <Switch
          id={elevateId}
          checked={elevated}
          onCheckedChange={handleElevateChange}
          disabled={isPending}
        />
        <Label htmlFor={elevateId} className="text-xs">
          Elevate
        </Label>
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
