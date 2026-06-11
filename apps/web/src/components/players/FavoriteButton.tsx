// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HeartIcon } from "@phosphor-icons/react";

type Props = {
  playerId: string;
  isFavorited: boolean;
  addAction: (playerId: string) => Promise<void>;
  removeAction: (playerId: string) => Promise<void>;
};

export function FavoriteButton({ playerId, isFavorited, addAction, removeAction }: Props) {
  const [favorited, setFavorited] = useState(isFavorited);
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    const next = !favorited;
    setFavorited(next);
    setIsPending(true);
    try {
      if (next) {
        await addAction(playerId);
      } else {
        await removeAction(playerId);
      }
    } catch {
      setFavorited(!next);
      toast.error(next ? "Failed to add favorite" : "Failed to remove favorite");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      title={favorited ? "Remove from favorites" : "Add to favorites"}
      className="text-primary disabled:opacity-50 hover:opacity-70 transition-opacity"
    >
      <HeartIcon size={24} weight={favorited ? "fill" : "regular"} />
    </button>
  );
}
