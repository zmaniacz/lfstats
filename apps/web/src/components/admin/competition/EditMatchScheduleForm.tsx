// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toDateTimeInputValue } from "@/lib/format";
import { useState } from "react";

type Props = {
  initialScheduledTime: Date | null;
  action: (formData: FormData) => Promise<void>;
};

export function EditMatchScheduleForm({ initialScheduledTime, action }: Props) {
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
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
        <Label htmlFor="scheduledTime">Scheduled Start</Label>
        <Input
          id="scheduledTime"
          name="scheduledTime"
          type="datetime-local"
          defaultValue={toDateTimeInputValue(initialScheduledTime)}
          className="w-56"
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
