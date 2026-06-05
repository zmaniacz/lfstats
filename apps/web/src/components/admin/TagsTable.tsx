// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TagForm } from "./TagForm"
import { MergeTagDialog } from "./MergeTagDialog"
import type { GameTagListItem } from "@lfstats/db"

type Props = {
  centerId: string
  tags: GameTagListItem[]
  createAction: (centerId: string, formData: FormData) => Promise<void>
  updateAction: (id: string, centerId: string, formData: FormData) => Promise<void>
  archiveAction: (id: string, centerId: string) => Promise<void>
  unarchiveAction: (id: string, centerId: string) => Promise<void>
  deleteAction: (id: string, centerId: string) => Promise<void>
  mergeAction: (sourceId: string, targetId: string, centerId: string) => Promise<void>
}

export function TagsTable({
  centerId,
  tags,
  createAction,
  updateAction,
  archiveAction,
  unarchiveAction,
  deleteAction,
  mergeAction,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [showArchived, setShowArchived] = useState(false)
  const [tagFormOpen, setTagFormOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<GameTagListItem | undefined>()
  const [mergeSource, setMergeSource] = useState<GameTagListItem | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<GameTagListItem | undefined>()

  const visible = showArchived ? tags : tags.filter((t) => !t.archived)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Button>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingTag(undefined)
            setTagFormOpen(true)
          }}
        >
          New Tag
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell className="font-medium">{tag.name}</TableCell>
                <TableCell>
                  {tag.color ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-4 h-4 rounded-full border"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {tag.color}
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {tag.description ?? "—"}
                </TableCell>
                <TableCell>
                  {tag.archived && (
                    <Badge variant="secondary">Archived</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        ⋯
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingTag(tag)
                          setTagFormOpen(true)
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          startTransition(async () => {
                            if (tag.archived) {
                              await unarchiveAction(tag.id, centerId)
                            } else {
                              await archiveAction(tag.id, centerId)
                            }
                          })
                        }}
                        disabled={isPending}
                      >
                        {tag.archived ? "Unarchive" : "Archive"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setMergeSource(tag)}
                      >
                        Merge into…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteTarget(tag)}
                      >
                        Delete permanently
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <TagForm
        centerId={centerId}
        tag={editingTag}
        open={tagFormOpen}
        onOpenChange={setTagFormOpen}
        createAction={createAction}
        updateAction={updateAction}
      />

      {mergeSource && (
        <MergeTagDialog
          sourceTag={mergeSource}
          availableTags={tags}
          centerId={centerId}
          open={mergeSource !== undefined}
          onOpenChange={(open) => { if (!open) setMergeSource(undefined) }}
          action={mergeAction}
        />
      )}

      {deleteTarget && (
        <AlertDialog open onOpenChange={(open) => { if (!open) setDeleteTarget(undefined) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete &ldquo;{deleteTarget.name}&rdquo; permanently?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This removes the tag and all its game assignments. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  startTransition(async () => {
                    await deleteAction(deleteTarget.id, centerId)
                    setDeleteTarget(undefined)
                  })
                }}
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
