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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, startRefreshTransition] = useTransition()
  const router = useRouter()
  const isPending = isSubmitting || isRefreshing

  async function handleClick() {
    setIsSubmitting(true)
    try {
      await action()
    } finally {
      setIsSubmitting(false)
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
