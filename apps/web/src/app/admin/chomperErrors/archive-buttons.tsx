// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  archiveChomperJobAction,
  archiveAllChomperJobsAction,
} from "./actions"

export function ArchiveButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false)
  const [, startRefreshTransition] = useTransition()
  const router = useRouter()

  async function handleClick() {
    setPending(true)
    try {
      await archiveChomperJobAction(id)
    } finally {
      setPending(false)
    }
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? "Archiving…" : "Archive"}
    </Button>
  )
}

export function ArchiveAllButton() {
  const [pending, setPending] = useState(false)
  const [, startRefreshTransition] = useTransition()
  const router = useRouter()

  async function handleClick() {
    setPending(true)
    try {
      await archiveAllChomperJobsAction()
    } finally {
      setPending(false)
    }
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? "Archiving…" : "Archive All"}
    </Button>
  )
}
