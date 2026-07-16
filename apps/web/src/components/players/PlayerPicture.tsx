// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Image from "next/image";
import { getPlayerPictureUrl } from "@/lib/player-pictures";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function PlayerPicture({
  entryId,
  hasProfilePicture,
  pictureVersion,
  name,
  size = 32,
  className,
}: {
  entryId: string;
  hasProfilePicture: boolean;
  pictureVersion?: number;
  name: string;
  size?: number;
  className?: string;
}) {
  if (hasProfilePicture) {
    return (
      <Image
        src={getPlayerPictureUrl(entryId, pictureVersion ?? 0)}
        alt={name}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-md object-cover", className)}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground font-medium",
        className,
      )}
    >
      <span style={{ fontSize: size * 0.4 }}>{initials(name)}</span>
    </div>
  );
}
