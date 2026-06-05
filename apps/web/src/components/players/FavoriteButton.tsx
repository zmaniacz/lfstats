// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useTransition } from "react"
import { HeartIcon } from "@phosphor-icons/react"

type Props = {
  playerId: string
  isFavorited: boolean
  addAction: (playerId: string) => Promise<void>
  removeAction: (playerId: string) => Promise<void>
}

export function FavoriteButton({ playerId, isFavorited, addAction, removeAction }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      if (isFavorited) {
        await removeAction(playerId)
      } else {
        await addAction(playerId)
      }
    })
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
