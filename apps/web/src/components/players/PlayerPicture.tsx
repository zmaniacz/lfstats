// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { cn } from "@/lib/utils";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * `src` is a short-lived signed URL from `signPlayerPictureUrls` (server-side), or null to
 * show initials. Player pictures are private, so there is no public URL to build here.
 */
export function PlayerPicture({
  src,
  name,
  size = 32,
  className,
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  if (src !== null) {
    return (
      // A plain <img> on purpose: next/image would cache the picture in the optimizer and
      // serve it from /_next/image to anyone, long after the signed URL expired.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
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
