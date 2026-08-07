// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = {
  id: string;
  label: string;
  description?: string;
  action: (id: string) => Promise<void>;
  size?: "sm" | "default" | "lg" | "icon";
  confirmLabel?: string;
};

export function DeleteEntityButton({
  id,
  label,
  description = "This action cannot be undone.",
  action,
  size = "sm",
  confirmLabel = "Delete",
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(e: React.MouseEvent) {
    // Keep the dialog open so a failure's error message stays visible —
    // AlertDialogAction closes on click by default (radix-ui's DialogClose),
    // which would otherwise hide the error before this async work resolves.
    e.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      await action(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setIsPending(false);
      return;
    }
    window.location.reload();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className="text-destructive hover:text-destructive"
          disabled={isPending}
        >
          {confirmLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending ? `${confirmLabel}…` : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
