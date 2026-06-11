// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { HeartIcon } from "@phosphor-icons/react";

type Props = {
  playerId: string;
  isFavorited: boolean;
  addAction: (playerId: string) => Promise<void>;
  removeAction: (playerId: string) => Promise<void>;
};

export function FavoriteButton({ playerId, isFavorited, addAction, removeAction }: Props) {
  const [optimisticFavorited, setOptimisticFavorited] = useOptimistic(isFavorited);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setOptimisticFavorited(!optimisticFavorited);
      try {
        if (isFavorited) {
          await removeAction(playerId);
        } else {
          await addAction(playerId);
        }
      } catch {
        // optimistic state reverts to `isFavorited` once the transition settles
        toast.error(isFavorited ? "Failed to remove favorite" : "Failed to add favorite");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={optimisticFavorited ? "Remove from favorites" : "Add to favorites"}
      title={optimisticFavorited ? "Remove from favorites" : "Add to favorites"}
      className="text-primary disabled:opacity-50 hover:opacity-70 transition-opacity"
    >
      <HeartIcon size={24} weight={optimisticFavorited ? "fill" : "regular"} />
    </button>
  );
}
