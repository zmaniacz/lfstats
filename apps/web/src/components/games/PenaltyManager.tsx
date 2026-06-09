// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PenaltyRecord } from "@lfstats/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Actions = {
  addAction: (gameId: string, scorecardId: string, formData: FormData) => Promise<void>;
  updateAction: (gameId: string, penaltyId: string, formData: FormData) => Promise<void>;
  rescindAction: (gameId: string, penaltyId: string, rescinded: boolean) => Promise<void>;
  deleteAction: (gameId: string, penaltyId: string) => Promise<void>;
};

type Props = {
  gameId: string;
  scorecardId: string;
  penalties: PenaltyRecord[];
  canEdit: boolean;
  actions: Actions;
};

export function PenaltyManager({ gameId, scorecardId, penalties, canEdit, actions }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const router = useRouter();
  const isPending = isSubmitting || isRefreshing;

  async function handleAdd(formData: FormData) {
    setIsSubmitting(true);
    try {
      await actions.addAction(gameId, scorecardId, formData);
      setShowAdd(false);
    } finally {
      setIsSubmitting(false);
    }
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  async function handleUpdate(penaltyId: string, formData: FormData) {
    setIsSubmitting(true);
    try {
      await actions.updateAction(gameId, penaltyId, formData);
      setEditingId(null);
    } finally {
      setIsSubmitting(false);
    }
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  async function handleRescind(penaltyId: string, rescinded: boolean) {
    setIsSubmitting(true);
    try {
      await actions.rescindAction(gameId, penaltyId, rescinded);
    } finally {
      setIsSubmitting(false);
    }
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  async function handleDelete(penaltyId: string) {
    setIsSubmitting(true);
    try {
      await actions.deleteAction(gameId, penaltyId);
    } finally {
      setIsSubmitting(false);
    }
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  if (penalties.length === 0 && !canEdit) return null;

  return (
    <div className="space-y-2">
      {penalties.length === 0 ? (
        <p className="text-sm text-muted-foreground">No penalties.</p>
      ) : (
        <div className="space-y-2">
          {penalties.map((p) => (
            <div
              key={p.id}
              className={`rounded border p-2 text-sm space-y-1 ${p.rescinded ? "opacity-50" : ""}`}
            >
              {editingId === p.id ? (
                <PenaltyForm
                  defaultValues={p}
                  onSubmit={(fd) => handleUpdate(p.id, fd)}
                  onCancel={() => setEditingId(null)}
                  isPending={isPending}
                />
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{p.type}</span>
                      {p.rescinded && (
                        <Badge variant="outline" className="text-xs">
                          Rescinded
                        </Badge>
                      )}
                      {!p.inGame && (
                        <Badge variant="secondary" className="text-xs">
                          Post-game
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground tabular-nums">
                      {p.scoreValue !== 0 && (
                        <span
                          className={
                            p.scoreValue < 0
                              ? "text-destructive"
                              : "text-green-600 dark:text-green-400"
                          }
                        >
                          Score: {p.scoreValue > 0 ? "+" : ""}
                          {p.scoreValue.toLocaleString("en-US")}
                        </span>
                      )}
                      {p.mvpValue !== 0 && (
                        <span
                          className={
                            p.mvpValue < 0
                              ? "text-destructive"
                              : "text-green-600 dark:text-green-400"
                          }
                        >
                          MVP: {p.mvpValue > 0 ? "+" : ""}
                          {p.mvpValue.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setEditingId(p.id)}
                        disabled={isPending}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleRescind(p.id, !p.rescinded)}
                        disabled={isPending}
                      >
                        {p.rescinded ? "Restore" : "Rescind"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleDelete(p.id)}
                        disabled={isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit &&
        (showAdd ? (
          <PenaltyForm
            onSubmit={handleAdd}
            onCancel={() => setShowAdd(false)}
            isPending={isPending}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setShowAdd(true)}
            disabled={isPending}
          >
            + Add Penalty
          </Button>
        ))}
    </div>
  );
}

function PenaltyForm({
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
  return (
    <form action={onSubmit} className="space-y-2 border rounded p-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Input
            name="type"
            defaultValue={defaultValues?.type ?? "Common Foul"}
            className="h-7 text-xs"
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Score Value</Label>
          <Input
            name="scoreValue"
            type="number"
            defaultValue={defaultValues?.scoreValue ?? 0}
            className="h-7 text-xs"
            disabled={isPending}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Input
            name="description"
            defaultValue={defaultValues?.description ?? ""}
            className="h-7 text-xs"
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">MVP Value</Label>
          <Input
            name="mvpValue"
            type="number"
            step="0.001"
            defaultValue={defaultValues?.mvpValue ?? 0}
            className="h-7 text-xs"
            disabled={isPending}
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" className="h-6 text-xs" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
