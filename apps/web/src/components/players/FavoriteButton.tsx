// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { HeartIcon } from "@phosphor-icons/react"

type Props = {
  playerId: string
  isFavorited: boolean
  addAction: (playerId: string) => Promise<void>
  removeAction: (playerId: string) => Promise<void>
}

export function FavoriteButton({ playerId, isFavorited, addAction, removeAction }: Props) {
  const [isPending, setIsPending] = useState(false)
  const router = useRouter()

  async function handleClick() {
    setIsPending(true)
    try {
      if (isFavorited) {
        await removeAction(playerId)
      } else {
        await addAction(playerId)
      }
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
      title={isFavorited ? "Remove from favorites" : "Add to favorites"}
      className="text-primary disabled:opacity-50 hover:opacity-70 transition-opacity"
    >
      <HeartIcon size={24} weight={isFavorited ? "fill" : "regular"} />
    </button>
  )
}
