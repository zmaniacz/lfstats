// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  archiveChomperJobAction,
  archiveAllChomperJobsAction,
} from "./actions"

export function ArchiveButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => archiveChomperJobAction(id))}
    >
      {pending ? "Archiving…" : "Archive"}
    </Button>
  )
}

export function ArchiveAllButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => archiveAllChomperJobsAction())}
    >
      {pending ? "Archiving…" : "Archive All"}
    </Button>
  )
}
