// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Image from "next/image";
import { getTeamLogoUrl } from "@/lib/team-logos";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function TeamLogo({
  teamId,
  hasLogo,
  name,
  size = 32,
  className,
}: {
  teamId: string;
  hasLogo: boolean;
  name: string;
  size?: number;
  className?: string;
}) {
  if (hasLogo) {
    return (
      <Image
        src={getTeamLogoUrl(teamId)}
        alt={name}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-md object-contain", className)}
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
