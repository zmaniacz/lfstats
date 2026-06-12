// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteEntityButton } from "./DeleteEntityButton";
import type { CompetitionPoolListItem, CompetitionPoolTeamAssignment } from "@lfstats/db";

const UNASSIGNED = "unassigned";

type Props = {
  pools: CompetitionPoolListItem[];
  assignments: CompetitionPoolTeamAssignment[];
  createPoolAction: (formData: FormData) => Promise<void>;
  renamePoolAction: (poolId: string, formData: FormData) => Promise<void>;
  deletePoolAction: (poolId: string) => Promise<void>;
  assignTeamAction: (teamId: string, poolId: string | null) => Promise<void>;
};

function AddPoolForm({ action }: { action: (formData: FormData) => Promise<void> }) {
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
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="poolName">Pool Name</Label>
        <Input id="poolName" name="name" required placeholder="e.g. Pool A" className="w-40" />
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Adding…" : "Add Pool"}
      </Button>
    </form>
  );
}

function RenamePoolForm({
  pool,
  action,
  onCancel,
}: {
  pool: CompetitionPoolListItem;
  action: (poolId: string, formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setIsPending(true);
    try {
      await action(pool.id, formData);
    } finally {
      window.location.reload();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input name="name" defaultValue={pool.name} required className="h-7 w-32" />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
        Cancel
      </Button>
    </form>
  );
}

function TeamChip({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: teamId,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border bg-background px-2 py-1 text-sm cursor-grab active:cursor-grabbing touch-none ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {teamName}
    </div>
  );
}

function PoolColumn({
  id,
  title,
  teams,
  controls,
}: {
  id: string;
  title: React.ReactNode;
  teams: { teamId: string; teamName: string }[];
  controls?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border p-3 space-y-2 min-h-32 ${
        isOver ? "border-primary bg-accent/50" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm">{title}</div>
        {controls}
      </div>
      <div className="flex flex-wrap gap-2">
        {teams.length === 0 ? (
          <p className="text-xs text-muted-foreground">No teams</p>
        ) : (
          teams.map((t) => <TeamChip key={t.teamId} teamId={t.teamId} teamName={t.teamName} />)
        )}
      </div>
    </div>
  );
}

export function PoolManager({
  pools,
  assignments,
  createPoolAction,
  renamePoolAction,
  deletePoolAction,
  assignTeamAction,
}: Props) {
  const [assignmentMap, setAssignmentMap] = useState<Record<string, string | null>>(() => {
    const map: Record<string, string | null> = {};
    for (const a of assignments) map[a.teamId] = a.poolId;
    return map;
  });
  const [renamingPoolId, setRenamingPoolId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const teamsByPool = new Map<string, { teamId: string; teamName: string }[]>();
  const unassigned: { teamId: string; teamName: string }[] = [];
  for (const a of assignments) {
    const poolId = assignmentMap[a.teamId] ?? null;
    const entry = { teamId: a.teamId, teamName: a.teamName };
    if (poolId === null) {
      unassigned.push(entry);
    } else {
      const existing = teamsByPool.get(poolId);
      if (existing) existing.push(entry);
      else teamsByPool.set(poolId, [entry]);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const teamId = active.id as string;
    const targetId = over.id as string;
    const newPoolId = targetId === UNASSIGNED ? null : targetId;
    const prevPoolId = assignmentMap[teamId] ?? null;
    if (newPoolId === prevPoolId) return;

    setAssignmentMap((prev) => ({ ...prev, [teamId]: newPoolId }));
    try {
      await assignTeamAction(teamId, newPoolId);
    } catch {
      setAssignmentMap((prev) => ({ ...prev, [teamId]: prevPoolId }));
    }
  }

  return (
    <div className="space-y-4">
      <AddPoolForm action={createPoolAction} />
      {pools.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a pool to start assigning teams.</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pools.map((pool) => (
              <PoolColumn
                key={pool.id}
                id={pool.id}
                teams={teamsByPool.get(pool.id) ?? []}
                title={
                  renamingPoolId === pool.id ? (
                    <RenamePoolForm
                      pool={pool}
                      action={renamePoolAction}
                      onCancel={() => setRenamingPoolId(null)}
                    />
                  ) : (
                    pool.name
                  )
                }
                controls={
                  renamingPoolId === pool.id ? undefined : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRenamingPoolId(pool.id)}
                      >
                        Rename
                      </Button>
                      <DeleteEntityButton
                        id={pool.id}
                        label={`"${pool.name}"`}
                        description="Matches assigned to this pool will become unscoped, not deleted."
                        action={deletePoolAction}
                      />
                    </div>
                  )
                }
              />
            ))}
            <PoolColumn id={UNASSIGNED} title="Unassigned" teams={unassigned} />
          </div>
        </DndContext>
      )}
    </div>
  );
}
