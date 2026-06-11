// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

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
import { useState } from "react";

type Props = {
  initialName: string;
  initialRoundNumber: number;
  initialType: "pool" | "finals";
  action: (formData: FormData) => Promise<void>;
};

export function EditRoundForm({ initialName, initialRoundNumber, initialType, action }: Props) {
  const [type, setType] = useState<"pool" | "finals">(initialType);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("type", type);
    setIsPending(true);
    try {
      await action(formData);
    } finally {
      window.location.reload();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
      <div className="space-y-1">
        <Label htmlFor="roundName">Round Name</Label>
        <Input
          id="roundName"
          name="name"
          required
          defaultValue={initialName}
          placeholder="e.g. Round 1"
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="roundNumber">Round #</Label>
        <Input
          id="roundNumber"
          name="roundNumber"
          type="number"
          required
          defaultValue={initialRoundNumber}
          min={1}
          className="w-20"
        />
      </div>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as "pool" | "finals")}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pool">Pool</SelectItem>
            <SelectItem value="finals">Finals</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
