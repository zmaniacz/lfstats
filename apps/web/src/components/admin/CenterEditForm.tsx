// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CenterDetail } from "@lfstats/db";

type Props = {
  center: CenterDetail;
  updateAction: (id: string, formData: FormData) => Promise<void>;
};

export function CenterEditForm({ center, updateAction }: Props) {
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setIsPending(true);
    try {
      await updateAction(center.id, formData);
    } finally {
      window.location.reload();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-1.5">
        <Label htmlFor="center-name">Name</Label>
        <Input id="center-name" name="name" defaultValue={center.name} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="center-shortName">Short Name</Label>
        <Input
          id="center-shortName"
          name="shortName"
          defaultValue={center.shortName ?? ""}
          placeholder="Optional abbreviated name"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="center-city">City</Label>
        <Input
          id="center-city"
          name="city"
          defaultValue={center.city ?? ""}
          placeholder="e.g. Sydney"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="center-countryName">Country</Label>
        <Input
          id="center-countryName"
          name="countryName"
          defaultValue={center.countryName ?? ""}
          placeholder="e.g. Australia"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="center-timezone">Timezone</Label>
        <Input
          id="center-timezone"
          name="timezone"
          defaultValue={center.timezone ?? ""}
          placeholder="e.g. Australia/Sydney"
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}
