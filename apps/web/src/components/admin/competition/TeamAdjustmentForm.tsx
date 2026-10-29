// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  teams: { id: string; name: string }[];
  action: (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Smallest adjustment: 1 for SM5, 0.5 for Laserball (a tied match is worth half a point). */
  step?: number;
};

export function TeamAdjustmentForm({ teams, action, step = 1 }: Props) {
  const [teamId, setTeamId] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("teamId", teamId);
    setIsPending(true);
    setError(null);
    try {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setTeamId("");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="adjustment-team">Team</Label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger id="adjustment-team" className="w-48">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="adjustment-points">Points</Label>
          <Input
            id="adjustment-points"
            name="points"
            type="number"
            step={step}
            required
            placeholder="-2"
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="adjustment-reason">Reason</Label>
          <Input
            id="adjustment-reason"
            name="reason"
            required
            placeholder="e.g. Missed referee duty"
            className="w-72"
          />
        </div>
        <Button type="submit" disabled={isPending || !teamId}>
          {isPending ? "Adding…" : "Add Adjustment"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
