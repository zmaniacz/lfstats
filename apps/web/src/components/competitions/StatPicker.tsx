// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MultiSelectFilter } from "@/components/filters/MultiSelectFilter";
import { TEAM_STATS, resolveStatKeys } from "@/lib/team-stat-catalog";

/**
 * The stat column chooser for the team player-comparison table: a grouped multi-select
 * dropdown, with the current selection echoed as removable pills.
 */
export function StatPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const selectedStats = resolveStatKeys(selected);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter
        label="Stats"
        options={TEAM_STATS.map((s) => ({ value: s.key, label: s.label, group: s.group }))}
        selected={selected}
        onChange={onChange}
        alwaysShowLabel
      />
      {selectedStats.map((stat) => (
        <Badge key={stat.key} variant="secondary" className="gap-1 pr-1">
          {stat.label}
          <button
            type="button"
            onClick={() => onChange(selected.filter((k) => k !== stat.key))}
            aria-label={`Remove ${stat.label}`}
            className="rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
