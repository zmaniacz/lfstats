// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState, useId, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteEntityButton } from "./DeleteEntityButton";
import Link from "next/link";
import type {
  CompetitionMatchListItem,
  CompetitionPoolListItem,
  CompetitionTeamListItem,
} from "@lfstats/db";

type Props = {
  competitionSlug: string;
  roundId: string;
  matches: CompetitionMatchListItem[];
  teams: CompetitionTeamListItem[];
  pools?: CompetitionPoolListItem[];
  deleteAction: (matchId: string) => Promise<void>;
  reorderAction: (reorders: { id: string; matchNumber: number }[]) => Promise<void>;
  updateTeamsAction: (matchId: string, formData: FormData) => Promise<void>;
};

function EditMatchTeamsForm({
  match,
  teams,
  pools,
  updateTeamsAction,
  onCancel,
}: {
  match: CompetitionMatchListItem;
  teams: CompetitionTeamListItem[];
  pools?: CompetitionPoolListItem[];
  updateTeamsAction: (matchId: string, formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [team1Id, setTeam1Id] = useState(match.team1Id ?? "tbd");
  const [team2Id, setTeam2Id] = useState(match.team2Id ?? "tbd");
  const [poolId, setPoolId] = useState(match.poolId ?? "none");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("team1Id", team1Id === "tbd" ? "" : team1Id);
    formData.set("team2Id", team2Id === "tbd" ? "" : team2Id);
    if (pools) formData.set("poolId", poolId === "none" ? "" : poolId);
    setIsPending(true);
    try {
      await updateTeamsAction(match.id, formData);
    } finally {
      window.location.reload();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 flex-wrap">
      {pools && (
        <Select value={poolId} onValueChange={setPoolId}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Pool…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Pool</SelectItem>
            {pools.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={team1Id} onValueChange={setTeam1Id}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Select team…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tbd">TBD</SelectItem>
          {teams.map((t) => (
            <SelectItem key={t.id} value={t.id} disabled={t.id === team2Id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground pb-2">vs</span>
      <Select value={team2Id} onValueChange={setTeam2Id}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Select team…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tbd">TBD</SelectItem>
          {teams.map((t) => (
            <SelectItem key={t.id} value={t.id} disabled={t.id === team1Id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
        Cancel
      </Button>
    </form>
  );
}

function SortableMatch({
  match,
  competitionSlug,
  roundId,
  teams,
  pools,
  deleteAction,
  updateTeamsAction,
}: {
  match: CompetitionMatchListItem;
  competitionSlug: string;
  roundId: string;
  teams: CompetitionTeamListItem[];
  pools?: CompetitionPoolListItem[];
  deleteAction: (id: string) => Promise<void>;
  updateTeamsAction: (matchId: string, formData: FormData) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: match.id,
  });

  const [isEditingTeams, setIsEditingTeams] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-3 px-3 py-2 bg-background"
    >
      <div className="flex items-center gap-3 text-sm">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-muted-foreground tabular-nums w-16 text-xs">
          Match {match.matchNumber}
        </span>
        {isEditingTeams ? (
          <EditMatchTeamsForm
            match={match}
            teams={teams}
            pools={pools}
            updateTeamsAction={updateTeamsAction}
            onCancel={() => setIsEditingTeams(false)}
          />
        ) : (
          <>
            <span className="font-medium">
              {match.team1Name} vs {match.team2Name}
            </span>
            <div className="flex gap-1">
              {match.poolName && (
                <Badge variant="outline" className="text-xs">
                  {match.poolName}
                </Badge>
              )}
              <Badge variant={match.game1Assigned ? "default" : "outline"} className="text-xs">
                G1
              </Badge>
              <Badge variant={match.game2Assigned ? "default" : "outline"} className="text-xs">
                G2
              </Badge>
            </div>
          </>
        )}
      </div>
      {!isEditingTeams && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setIsEditingTeams(true)}>
            Edit Teams
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/admin/competitions/${competitionSlug}/rounds/${roundId}/matches/${match.id}`}
            >
              Assign Games
            </Link>
          </Button>
          <DeleteEntityButton
            id={match.id}
            label={`Match ${match.matchNumber}: ${match.team1Name} vs ${match.team2Name}`}
            description="This removes the match and any assigned game links."
            action={deleteAction}
          />
        </div>
      )}
    </div>
  );
}

export function SortableMatchList({
  competitionSlug,
  roundId,
  matches: initialMatches,
  teams,
  pools,
  deleteAction,
  reorderAction,
  updateTeamsAction,
}: Props) {
  const [matches, setMatches] = useState(initialMatches);
  const [isPending, setIsPending] = useState(false);
  const dndId = useId();

  useEffect(() => {
    setMatches(initialMatches);
  }, [initialMatches]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = matches.findIndex((m) => m.id === active.id);
    const newIndex = matches.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(matches, oldIndex, newIndex);

    // Reassign matchNumber sequentially based on new order
    const withNewNumbers = reordered.map((m, i) => ({ ...m, matchNumber: i + 1 }));
    setMatches(withNewNumbers);

    setIsPending(true);
    try {
      await reorderAction(withNewNumbers.map(({ id, matchNumber }) => ({ id, matchNumber })));
    } finally {
      setIsPending(false);
    }
  }

  if (matches.length === 0) return null;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={matches.map((m) => m.id)} strategy={verticalListSortingStrategy}>
        <div className={`divide-y border rounded-md ${isPending ? "opacity-70" : ""}`}>
          {matches.map((match) => (
            <SortableMatch
              key={match.id}
              match={match}
              competitionSlug={competitionSlug}
              roundId={roundId}
              teams={teams}
              pools={pools}
              deleteAction={deleteAction}
              updateTeamsAction={updateTeamsAction}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
