// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import * as React from "react";
import Image from "next/image";
import { getTeamLogoUrl } from "@/lib/team-logos";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function TeamLogo({
  teamId,
  hasLogo,
  logoVersion,
  name,
  size = 32,
  className,
  expandable = false,
}: {
  teamId?: string;
  hasLogo: boolean;
  logoVersion?: number;
  name: string;
  size?: number;
  className?: string;
  expandable?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  if (teamId && hasLogo) {
    const url = getTeamLogoUrl(teamId, logoVersion ?? 0);
    const image = (
      <Image
        src={url}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn("shrink-0 rounded-md object-contain", className)}
      />
    );

    if (!expandable) return image;

    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View full-size logo for ${name}`}
        >
          {image}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg" showCloseButton>
            <DialogTitle className="sr-only">{name} logo</DialogTitle>
            <div className="relative h-[70vh] w-full">
              <Image
                src={url}
                alt={name}
                fill
                sizes="(min-width: 640px) 32rem, 100vw"
                className="object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
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
