// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import type { TeamPenaltyRecord } from "@lfstats/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TeamPenaltyForm } from "./TeamPenaltyForm";

type Actions = {
  addAction: (gameId: string, gameTeamId: string, formData: FormData) => Promise<void>;
  updateAction: (gameId: string, penaltyId: string, formData: FormData) => Promise<void>;
  rescindAction: (gameId: string, penaltyId: string, rescinded: boolean) => Promise<void>;
  deleteAction: (gameId: string, penaltyId: string) => Promise<void>;
};

type Props = {
  gameId: string;
  gameTeamId: string;
  penalties: TeamPenaltyRecord[];
  canEdit: boolean;
  actions: Actions;
};

export function TeamPenaltyManager({ gameId, gameTeamId, penalties, canEdit, actions }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function handleAdd(formData: FormData) {
    setIsPending(true);
    try {
      await actions.addAction(gameId, gameTeamId, formData);
    } finally {
      window.location.reload();
    }
  }

  async function handleUpdate(penaltyId: string, formData: FormData) {
    setIsPending(true);
    try {
      await actions.updateAction(gameId, penaltyId, formData);
    } finally {
      window.location.reload();
    }
  }

  async function handleRescind(penaltyId: string, rescinded: boolean) {
    setIsPending(true);
    try {
      await actions.rescindAction(gameId, penaltyId, rescinded);
    } finally {
      window.location.reload();
    }
  }

  async function handleDelete(penaltyId: string) {
    setIsPending(true);
    try {
      await actions.deleteAction(gameId, penaltyId);
    } finally {
      window.location.reload();
    }
  }

  if (penalties.length === 0 && !canEdit) return null;

  return (
    <div className="space-y-2">
      {penalties.length === 0 ? (
        <p className="text-sm text-muted-foreground">No team penalties.</p>
      ) : (
        <div className="space-y-2">
          {penalties.map((p) => (
            <div
              key={p.id}
              className={`rounded border p-2 text-sm space-y-1 ${p.rescinded ? "opacity-50" : ""}`}
            >
              {editingId === p.id ? (
                <TeamPenaltyForm
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
                      {p.description && (
                        <span className="text-muted-foreground">{p.description}</span>
                      )}
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
                    {p.scoreValue !== 0 && (
                      <div className="flex gap-3 text-xs text-muted-foreground tabular-nums">
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
                      </div>
                    )}
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
          <TeamPenaltyForm
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
            + Add Team Penalty
          </Button>
        ))}
    </div>
  );
}
