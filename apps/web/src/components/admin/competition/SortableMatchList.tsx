"use client"

import { useState, useTransition } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DeleteEntityButton } from "./DeleteEntityButton"
import Link from "next/link"
import type { CompetitionMatchListItem } from "@lfstats/db"

type Props = {
  competitionId: string
  roundId: string
  matches: CompetitionMatchListItem[]
  deleteAction: (matchId: string) => Promise<void>
  reorderAction: (reorders: { id: string; matchNumber: number }[]) => Promise<void>
}

function SortableMatch({
  match,
  competitionId,
  roundId,
  deleteAction,
}: {
  match: CompetitionMatchListItem
  competitionId: string
  roundId: string
  deleteAction: (id: string) => Promise<void>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: match.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between px-3 py-2 bg-background"
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
        <span className="font-medium">
          {match.team1Name} vs {match.team2Name}
        </span>
        <div className="flex gap-1">
          <Badge variant={match.game1Assigned ? "default" : "outline"} className="text-xs">
            G1
          </Badge>
          <Badge variant={match.game2Assigned ? "default" : "outline"} className="text-xs">
            G2
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`}>
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
    </div>
  )
}

export function SortableMatchList({
  competitionId,
  roundId,
  matches: initialMatches,
  deleteAction,
  reorderAction,
}: Props) {
  const [matches, setMatches] = useState(initialMatches)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = matches.findIndex((m) => m.id === active.id)
    const newIndex = matches.findIndex((m) => m.id === over.id)
    const reordered = arrayMove(matches, oldIndex, newIndex)

    // Reassign matchNumber sequentially based on new order
    const withNewNumbers = reordered.map((m, i) => ({ ...m, matchNumber: i + 1 }))
    setMatches(withNewNumbers)

    startTransition(async () => {
      await reorderAction(withNewNumbers.map(({ id, matchNumber }) => ({ id, matchNumber })))
    })
  }

  if (matches.length === 0) return null

  return (
    <DndContext
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
              competitionId={competitionId}
              roundId={roundId}
              deleteAction={deleteAction}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
