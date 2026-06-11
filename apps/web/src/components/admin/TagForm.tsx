// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GameTagListItem } from "@lfstats/db";
import { useState } from "react";

type Props = {
  centerId: string;
  tag?: GameTagListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createAction: (centerId: string, formData: FormData) => Promise<void>;
  updateAction: (id: string, centerId: string, formData: FormData) => Promise<void>;
};

export function TagForm({ centerId, tag, open, onOpenChange, createAction, updateAction }: Props) {
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setIsPending(true);
    try {
      if (tag) {
        await updateAction(tag.id, centerId, formData);
      } else {
        await createAction(centerId, formData);
      }
    } finally {
      window.location.reload();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tag ? "Edit Tag" : "New Tag"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">Name</Label>
            <Input
              id="tag-name"
              name="name"
              defaultValue={tag?.name}
              required
              placeholder="e.g. practice"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tag-color">Color (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="tag-color"
                name="color"
                type="color"
                defaultValue={tag?.color ?? "#6366f1"}
                className="w-16 h-10 p-1 cursor-pointer"
              />
              <Input
                name="colorText"
                defaultValue={tag?.color ?? ""}
                placeholder="#6366f1"
                className="flex-1"
                onChange={(e) => {
                  const colorInput = document.getElementById("tag-color") as HTMLInputElement;
                  if (colorInput) colorInput.value = e.target.value;
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tag-description">Description (optional)</Label>
            <Input
              id="tag-description"
              name="description"
              defaultValue={tag?.description ?? ""}
              placeholder="What is this tag for?"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : tag ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
