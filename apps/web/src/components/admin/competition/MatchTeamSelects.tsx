// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CompetitionTeamListItem } from "@lfstats/db";

/**
 * The team slots of one match, as Select values ("tbd" for an empty slot). In a trios
 * competition each side holds two trios, in a duos competition three duos; the partner slots
 * are unused otherwise (and partner2 outside duos).
 */
export type MatchTeamSlots = {
  team1Id: string;
  team1PartnerId: string;
  team1Partner2Id: string;
  team2Id: string;
  team2PartnerId: string;
  team2Partner2Id: string;
};

type SlotKey = keyof MatchTeamSlots;

/** How many competition teams share each side of a match — see `teamsPerSide` in @lfstats/db. */
export type TeamsPerSide = 1 | 2 | 3;

export const EMPTY_MATCH_SLOTS: MatchTeamSlots = {
  team1Id: "tbd",
  team1PartnerId: "tbd",
  team1Partner2Id: "tbd",
  team2Id: "tbd",
  team2PartnerId: "tbd",
  team2Partner2Id: "tbd",
};

export function matchSlotsFrom(m: {
  team1Id: string | null;
  team1PartnerId: string | null;
  team1Partner2Id: string | null;
  team2Id: string | null;
  team2PartnerId: string | null;
  team2Partner2Id: string | null;
}): MatchTeamSlots {
  return {
    team1Id: m.team1Id ?? "tbd",
    team1PartnerId: m.team1PartnerId ?? "tbd",
    team1Partner2Id: m.team1Partner2Id ?? "tbd",
    team2Id: m.team2Id ?? "tbd",
    team2PartnerId: m.team2PartnerId ?? "tbd",
    team2Partner2Id: m.team2Partner2Id ?? "tbd",
  };
}

// The slots on each side that a format uses, in display order.
function sideSlots(teamsPerSide: TeamsPerSide): [SlotKey[], SlotKey[]] {
  const side1: SlotKey[] = ["team1Id", "team1PartnerId", "team1Partner2Id"];
  const side2: SlotKey[] = ["team2Id", "team2PartnerId", "team2Partner2Id"];
  return [side1.slice(0, teamsPerSide), side2.slice(0, teamsPerSide)];
}

/** Writes the slots into the form data the match actions read; only the format's own slots. */
export function setMatchSlotsOnFormData(
  formData: FormData,
  slots: MatchTeamSlots,
  teamsPerSide: TeamsPerSide,
): void {
  for (const key of sideSlots(teamsPerSide).flat()) {
    formData.set(key, slots[key] === "tbd" ? "" : slots[key]);
  }
}

const SLOT_LABELS: Record<SlotKey, string> = {
  team1Id: "Team 1",
  team1PartnerId: "Team 1 partner",
  team1Partner2Id: "Team 1 partner 2",
  team2Id: "Team 2",
  team2PartnerId: "Team 2 partner",
  team2Partner2Id: "Team 2 partner 2",
};

const TRIO_SLOT_LABELS: Record<SlotKey, string> = {
  ...SLOT_LABELS,
  team1Id: "Side 1 · Trio A",
  team1PartnerId: "Side 1 · Trio B",
  team2Id: "Side 2 · Trio A",
  team2PartnerId: "Side 2 · Trio B",
};

const DUO_SLOT_LABELS: Record<SlotKey, string> = {
  team1Id: "Side 1 · Duo A",
  team1PartnerId: "Side 1 · Duo B",
  team1Partner2Id: "Side 1 · Duo C",
  team2Id: "Side 2 · Duo A",
  team2PartnerId: "Side 2 · Duo B",
  team2Partner2Id: "Side 2 · Duo C",
};

const LABELS_BY_SIZE: Record<TeamsPerSide, Record<SlotKey, string>> = {
  1: SLOT_LABELS,
  2: TRIO_SLOT_LABELS,
  3: DUO_SLOT_LABELS,
};

type Props = {
  teams: CompetitionTeamListItem[];
  slots: MatchTeamSlots;
  onChange: (slots: MatchTeamSlots) => void;
  teamsPerSide: TeamsPerSide;
  /** Show a label above each select (the add-match form) or not (inline edit rows). */
  labelled?: boolean;
  triggerClassName?: string;
};

/**
 * Team pickers for one match: "Team 1 vs Team 2", for trios "A + B vs C + D", for duos
 * "A + B + C vs D + E + F". A team chosen in any slot is disabled in the others, mirroring the
 * competition_match distinct-teams check.
 */
export function MatchTeamSelects({
  teams,
  slots,
  onChange,
  teamsPerSide,
  labelled = false,
  triggerClassName = "w-44",
}: Props) {
  const labels = LABELS_BY_SIZE[teamsPerSide];
  const [side1, side2] = sideSlots(teamsPerSide);
  const used = [...side1, ...side2];

  function renderSelect(key: SlotKey) {
    const takenElsewhere = new Set(
      used
        .filter((k) => k !== key)
        .map((k) => slots[k])
        .filter((v) => v !== "tbd"),
    );
    const select = (
      <Select value={slots[key]} onValueChange={(v) => onChange({ ...slots, [key]: v })}>
        <SelectTrigger className={triggerClassName} aria-label={labels[key]}>
          <SelectValue placeholder="Select team…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tbd">TBD</SelectItem>
          {teams.map((t) => (
            <SelectItem key={t.id} value={t.id} disabled={takenElsewhere.has(t.id)}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
    if (!labelled) return <div key={key}>{select}</div>;
    return (
      <div key={key} className="space-y-1">
        <Label>{labels[key]}</Label>
        {select}
      </div>
    );
  }

  const renderSide = (keys: SlotKey[]) =>
    keys.flatMap((key, i) => [
      ...(i > 0
        ? [
            <span key={`${key}-plus`} className="text-sm text-muted-foreground pb-2">
              +
            </span>,
          ]
        : []),
      renderSelect(key),
    ]);

  return (
    <>
      {renderSide(side1)}
      <span className="text-sm text-muted-foreground pb-2">vs</span>
      {renderSide(side2)}
    </>
  );
}
