// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Toggles the player profile between SM5 and Laserball stats via the `game`
// search param, preserving all other filters (scope/center/competition).
export function PlayerGameTypeToggle({ active }: { active: "sm5" | "lb" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function href(gameType: "sm5" | "lb") {
    const params = new URLSearchParams(searchParams.toString());
    if (gameType === "sm5") params.delete("game");
    else params.set("game", "lb");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const base =
    "px-3 py-1 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none";
  const activeCls = "bg-primary text-primary-foreground";
  const inactiveCls = "text-muted-foreground hover:text-foreground";

  return (
    <div className="inline-flex items-center rounded-md border p-0.5">
      <Link href={href("sm5")} className={cn(base, active === "sm5" ? activeCls : inactiveCls)}>
        SM5
      </Link>
      <Link href={href("lb")} className={cn(base, active === "lb" ? activeCls : inactiveCls)}>
        Laserball
      </Link>
    </div>
  );
}
