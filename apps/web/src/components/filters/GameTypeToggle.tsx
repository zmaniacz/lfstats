// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { cn } from "@/lib/utils";
import { GAME_TYPE_COOKIE, type FilterGameType } from "@/lib/filter-cookies";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Toggles a page between SM5 and Laserball via the `game` search param, preserving
// all other filters. Used across the shared section pages.
export function GameTypeToggle({ active }: { active: FilterGameType }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function persistGameType(gameType: FilterGameType) {
    document.cookie = `${GAME_TYPE_COOKIE}=${gameType}; path=/; max-age=31536000; SameSite=Lax`;
  }

  function href(gameType: FilterGameType) {
    const params = new URLSearchParams(searchParams.toString());
    if (gameType === "sm5") params.delete("game");
    else params.set("game", "lb");
    // Reset pagination when switching game type.
    params.delete("page");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const base =
    "px-3 py-1 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none";
  const activeCls = "bg-primary text-primary-foreground";
  const inactiveCls = "text-muted-foreground hover:text-foreground";

  return (
    <div className="inline-flex items-center rounded-md border p-0.5">
      <Link
        href={href("sm5")}
        onClick={() => persistGameType("sm5")}
        className={cn(base, active === "sm5" ? activeCls : inactiveCls)}
      >
        SM5
      </Link>
      <Link
        href={href("lb")}
        onClick={() => persistGameType("lb")}
        className={cn(base, active === "lb" ? activeCls : inactiveCls)}
      >
        Laserball
      </Link>
    </div>
  );
}
