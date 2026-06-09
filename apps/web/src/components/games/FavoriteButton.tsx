// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HeartIcon } from "@phosphor-icons/react";

type Props = {
  gameId: string;
  isFavorited: boolean;
  addAction: (gameId: string) => Promise<void>;
  removeAction: (gameId: string) => Promise<void>;
};

export function FavoriteButton({ gameId, isFavorited, addAction, removeAction }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const router = useRouter();
  const isPending = isSubmitting || isRefreshing;

  async function handleClick() {
    setIsSubmitting(true);
    try {
      if (isFavorited) {
        await removeAction(gameId);
      } else {
        await addAction(gameId);
      }
    } finally {
      setIsSubmitting(false);
    }
    startRefreshTransition(() => {
      router.refresh();
    });
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
  );
}
