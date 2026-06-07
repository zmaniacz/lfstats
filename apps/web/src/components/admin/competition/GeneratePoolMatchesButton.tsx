// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface Props {
  action: () => Promise<void>
}

export function GeneratePoolMatchesButton({ action }: Props) {
  const [isPending, setIsPending] = useState(false)
  const [, startRefreshTransition] = useTransition()
  const router = useRouter()

  async function handleClick() {
    setIsPending(true)
    try {
      await action()
    } finally {
      setIsPending(false)
    }
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={isPending}
      onClick={handleClick}
    >
      {isPending ? "Generating…" : "Generate Matches"}
    </Button>
  )
}
