// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface Props {
  action: () => Promise<void>
}

export function GeneratePoolMatchesButton({ action }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(async () => { await action(); router.refresh() })}
    >
      {isPending ? "Generating…" : "Generate Matches"}
    </Button>
  )
}
