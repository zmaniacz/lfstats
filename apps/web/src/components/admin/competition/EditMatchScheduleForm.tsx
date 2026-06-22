// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toDateTimeInputValue } from "@/lib/format";

const OFFSET_OPTIONS = [
  { value: "60", label: "+60 min" },
  { value: "70", label: "+70 min" },
  { value: "75", label: "+75 min" },
  { value: "80", label: "+80 min" },
  { value: "90", label: "+90 min" },
  { value: "custom", label: "Custom" },
] as const;

type OffsetValue = (typeof OFFSET_OPTIONS)[number]["value"];

function detectOffset(g1: Date | null, g2: Date | null): OffsetValue {
  if (!g1 || !g2) return "80";
  const diffMin = Math.round((g2.getTime() - g1.getTime()) / 60000);
  const preset = OFFSET_OPTIONS.find((o) => o.value !== "custom" && parseInt(o.value) === diffMin);
  return preset ? preset.value : "custom";
}

type Props = {
  initialGame1ScheduledStartTime: Date | null;
  initialGame2ScheduledStartTime: Date | null;
  action: (formData: FormData) => Promise<void>;
};

export function EditMatchScheduleForm({
  initialGame1ScheduledStartTime,
  initialGame2ScheduledStartTime,
  action,
}: Props) {
  const [isPending, setIsPending] = useState(false);
  const [game2Mode, setGame2Mode] = useState<OffsetValue>(() =>
    detectOffset(initialGame1ScheduledStartTime, initialGame2ScheduledStartTime),
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("game2Mode", game2Mode);
    setIsPending(true);
    try {
      await action(formData);
    } finally {
      window.location.reload();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label htmlFor="game1ScheduledTime">Game 1 Start</Label>
          <Input
            id="game1ScheduledTime"
            name="game1ScheduledTime"
            type="datetime-local"
            defaultValue={toDateTimeInputValue(initialGame1ScheduledStartTime)}
            className="w-56"
          />
        </div>

        <div className="space-y-1">
          <Label>Game 2</Label>
          <Select value={game2Mode} onValueChange={(v) => setGame2Mode(v as OffsetValue)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OFFSET_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {game2Mode === "custom" && (
          <div className="space-y-1">
            <Label htmlFor="game2ScheduledTime">Game 2 Start</Label>
            <Input
              id="game2ScheduledTime"
              name="game2ScheduledTime"
              type="datetime-local"
              defaultValue={toDateTimeInputValue(initialGame2ScheduledStartTime)}
              className="w-56"
            />
          </div>
        )}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
