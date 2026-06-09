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
import type { CompetitionDetail } from "@lfstats/db";
import type { CenterListItem } from "@lfstats/db";

type Props = {
  competition?: CompetitionDetail;
  centers: CenterListItem[];
  action: (formData: FormData) => Promise<void>;
};

export function CompetitionForm({ competition, centers, action }: Props) {
  const [isPending, setIsPending] = useState(false);
  const [type, setType] = useState<string>(competition?.type ?? "competitive");
  const [hostCenterId, setHostCenterId] = useState<string>(competition?.hostCenterId ?? "none");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("type", type);
    formData.set("hostCenterId", hostCenterId === "none" ? "" : hostCenterId);
    setIsPending(true);
    try {
      await action(formData);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={competition?.name}
          required
          placeholder="e.g. Internats 2026"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select value={type} onValueChange={setType} name="type">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="competitive">Competitive</SelectItem>
            <SelectItem value="social">Social</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="startDate">Start Date</Label>
        <Input
          id="startDate"
          name="startDate"
          type="date"
          defaultValue={competition?.startDate}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="endDate">End Date (optional)</Label>
        <Input id="endDate" name="endDate" type="date" defaultValue={competition?.endDate ?? ""} />
      </div>

      <div className="space-y-1.5">
        <Label>Host Center (optional)</Label>
        <Select value={hostCenterId} onValueChange={setHostCenterId} name="hostCenterId">
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {centers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Input
          id="description"
          name="description"
          defaultValue={competition?.description ?? ""}
          placeholder="Optional description"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : competition ? "Save Changes" : "Create Competition"}
      </Button>
    </form>
  );
}
