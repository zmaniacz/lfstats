// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { createContext, useContext, useState } from "react";
import { Slider } from "@/components/ui/slider";

const MIN_GAMES_COOKIE = "minGames";
const DEFAULT_MIN_GAMES = 25;

const MinGamesContext = createContext<number>(0);

export function useMinGames(): number {
  return useContext(MinGamesContext);
}

function readMinGamesCookie(): number {
  const match = document.cookie.match(new RegExp(`(?:^|; )${MIN_GAMES_COOKIE}=(\\d+)`));
  if (!match) return DEFAULT_MIN_GAMES;
  const value = parseInt(match[1], 10);
  return value >= 0 && value <= 100 ? value : DEFAULT_MIN_GAMES;
}

function writeMinGamesCookie(value: number): void {
  document.cookie = `${MIN_GAMES_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function MinGamesProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [minGames, setMinGames] = useState(() => {
    if (typeof document === "undefined") return DEFAULT_MIN_GAMES;
    return readMinGamesCookie();
  });

  function handleChange(value: number) {
    setMinGames(value);
    writeMinGamesCookie(value);
  }

  return (
    <MinGamesContext.Provider value={enabled ? minGames : 0}>
      {enabled && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium whitespace-nowrap">Min. Games</span>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[minGames]}
            onValueChange={(v) => handleChange(v[0] ?? DEFAULT_MIN_GAMES)}
            className="w-48"
          />
          <span className="text-sm tabular-nums w-8 text-right">{minGames}</span>
        </div>
      )}
      {children}
    </MinGamesContext.Provider>
  );
}
