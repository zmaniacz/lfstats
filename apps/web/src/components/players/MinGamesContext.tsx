// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { createContext, useContext, useState } from "react";
import { Slider } from "@/components/ui/slider";

const MinGamesContext = createContext<number>(0);

export function useMinGames(): number {
  return useContext(MinGamesContext);
}

export function MinGamesProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [minGames, setMinGames] = useState(25);

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
            onValueChange={(v) => setMinGames(v[0] ?? 25)}
            className="w-48"
          />
          <span className="text-sm tabular-nums w-8 text-right">{minGames}</span>
        </div>
      )}
      {children}
    </MinGamesContext.Provider>
  );
}
